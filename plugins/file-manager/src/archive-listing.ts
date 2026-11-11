import { spawn } from "node:child_process";
import { open, stat, type FileHandle } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import type { Stats } from "node:fs";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  RandomAccessReader,
  fromRandomAccessReaderPromise,
  type ZipFile,
} from "yauzl";

import {
  MAX_ARCHIVE_ENTRIES,
  detectArchiveFormat,
  type ArchiveFormat,
  type ArchiveListing,
  type ArchiveStopReason,
} from "../contract";
import {
  LineSplitter,
  ListingCollector,
  SevenZipListParser,
  ZIP_TAIL_BYTES,
  parseTarLine,
  zipEntryFrom,
  zipPrefixLength,
} from "./archive-parse";
import type { Executables } from "./archives";
import {
  fmError,
  isFileManagerError,
  mapNodeError,
  type FileManagerError,
} from "./errors";
import { resolveExisting } from "./root";

export interface ListingLimits {
  maxEntries: number;
  maxScanned: number;
  maxDirectories: number;
  timeoutMs: number;
  maxOutputBytes: number;
  maxLineBytes: number;
}

export const DEFAULT_LISTING_LIMITS: ListingLimits = {
  maxEntries: MAX_ARCHIVE_ENTRIES,
  maxScanned: 1_000_000,
  maxDirectories: 100_000,
  timeoutMs: 10_000,
  maxOutputBytes: 256 * 1024 * 1024,
  maxLineBytes: 64 * 1024,
};

const KILL_ESCALATION_MS = 3_000;
const STDERR_LIMIT = 8 * 1024;

const NO_PASSWORD = "-pbb-file-manager-listing";

export interface ListerProcess {
  readonly pid?: number | undefined;
  readonly stdout: NodeJS.ReadableStream | null;
  readonly stderr: NodeJS.ReadableStream | null;
  kill(signal?: NodeJS.Signals | number): boolean;
  once(
    event: "close",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): unknown;
  once(event: "error", listener: (error: Error) => void): unknown;
}

export type SpawnLister = (
  command: string,
  args: readonly string[],
  options: { env: NodeJS.ProcessEnv },
) => ListerProcess;

const defaultSpawn: SpawnLister = (command, args, options) =>
  spawn(command, [...args], {
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

function signalChild(child: ListerProcess, signal: NodeJS.Signals): void {
  if (typeof child.pid === "number") {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {}
  }
  try {
    child.kill(signal);
  } catch {}
}

function summarize(stderr: string): string {
  return stderr
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !/^[A-Z]+:$/u.test(line))
    .slice(0, 4)
    .join("; ");
}

function cannotRun(
  command: string,
  fileName: string,
  error: unknown,
): FileManagerError {
  const reason = error instanceof Error ? error.message : String(error);
  return fmError(
    "archive_failed",
    `${fileName}: could not run ${path.basename(command)} (${reason})`,
  );
}

const WINDOW_BYTES = 256 * 1024;

class WindowedReader extends RandomAccessReader {
  private window: Buffer = Buffer.alloc(0);
  private windowStart = 0;
  private closed = false;

  constructor(
    private readonly handle: FileHandle,
    private readonly prefix: number,
  ) {
    super();
  }

  override read(
    buffer: Buffer,
    offset: number,
    length: number,
    position: number,
    callback: (error: Error | null, bytesRead?: number) => void,
  ): void {
    const start = position + this.prefix;
    const from = start - this.windowStart;
    if (from >= 0 && from + length <= this.window.length) {
      this.window.copy(buffer, offset, from, from + length);
      setImmediate(() => callback(null, length));
      return;
    }
    if (length > WINDOW_BYTES) {
      this.handle.read(buffer, offset, length, start).then(
        (result) => callback(null, result.bytesRead),
        (error: unknown) =>
          callback(error instanceof Error ? error : new Error(String(error))),
      );
      return;
    }
    const window = Buffer.allocUnsafe(WINDOW_BYTES);
    this.handle.read(window, 0, WINDOW_BYTES, start).then(
      (result) => {
        this.window = window.subarray(0, result.bytesRead);
        this.windowStart = start;
        const copied = Math.min(length, result.bytesRead);
        this.window.copy(buffer, offset, 0, copied);
        callback(null, copied);
      },
      (error: unknown) =>
        callback(error instanceof Error ? error : new Error(String(error))),
    );
  }

  override _readStreamForRange(start: number, end: number): Readable {
    return this.handle.createReadStream({
      start: start + this.prefix,
      end: end + this.prefix - 1,
      autoClose: false,
    });
  }

  override close(callback: (error: Error | null) => void): void {
    if (this.closed) {
      setImmediate(() => callback(null));
      return;
    }
    this.closed = true;
    this.handle.close().then(
      () => callback(null),
      (error: unknown) =>
        callback(error instanceof Error ? error : new Error(String(error))),
    );
  }
}

export interface ArchiveListerOptions {
  executables: Executables;
  canExtract(format: ArchiveFormat): boolean;
  spawnLister?: SpawnLister;
  limits?: Partial<ListingLimits>;
}

export interface ArchiveLister {
  listArchive(input: { path: string }): Promise<ArchiveListing>;
}

interface ScanOutcome {
  stoppedBy: ArchiveStopReason | null;
  problem: string | null;
}

interface RunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  stoppedBy: ArchiveStopReason | null;
}

export function createArchiveLister(
  bb: BbPluginApi,
  options: ArchiveListerOptions,
): ArchiveLister {
  const { executables } = options;
  const spawnLister = options.spawnLister ?? defaultSpawn;
  const limits: ListingLimits = {
    ...DEFAULT_LISTING_LIMITS,
    ...options.limits,
  };
  const live = new Map<ListerProcess, () => void>();
  let disposed = false;

  function shuttingDown(fileName: string): FileManagerError {
    return fmError(
      "archive_failed",
      `${fileName}: listing stopped, the plugin is shutting down`,
    );
  }

  function runLister(
    command: string,
    args: readonly string[],
    env: NodeJS.ProcessEnv,
    encoding: "latin1" | "utf8",
    deadline: number,
    fileName: string,
    onLine: (line: string) => boolean,
  ): Promise<RunResult> {
    return new Promise<RunResult>((resolve, reject) => {
      if (disposed) {
        reject(shuttingDown(fileName));
        return;
      }
      let child: ListerProcess;
      try {
        child = spawnLister(command, args, { env });
      } catch (error) {
        reject(cannotRun(command, fileName, error));
        return;
      }

      const splitter = new LineSplitter(limits.maxLineBytes, encoding);
      let stoppedBy: ArchiveStopReason | null = null;
      let aborted = false;
      let outputBytes = 0;
      let stderr = "";
      let escalation: ReturnType<typeof setTimeout> | null = null;
      let settled = false;

      const terminate = (): void => {
        if (settled || escalation !== null) return;
        signalChild(child, "SIGTERM");
        escalation = setTimeout(() => {
          if (!settled) signalChild(child, "SIGKILL");
        }, KILL_ESCALATION_MS);
        escalation.unref?.();
      };
      const stop = (reason: ArchiveStopReason): void => {
        if (stoppedBy !== null || aborted) return;
        stoppedBy = reason;
        terminate();
      };
      live.set(child, () => {
        if (aborted) return;
        aborted = true;
        terminate();
      });

      const timer = setTimeout(
        () => stop("time"),
        Math.max(0, deadline - Date.now()),
      );
      timer.unref?.();

      child.stdout?.on("data", (chunk: Buffer) => {
        if (stoppedBy !== null || aborted) return;
        outputBytes += chunk.length;
        if (outputBytes > limits.maxOutputBytes) {
          stop("output");
          return;
        }
        if (!splitter.push(chunk, onLine)) stop("entries");
      });
      child.stderr?.on("data", (piece: Buffer) => {
        if (stderr.length < STDERR_LIMIT) stderr += piece.toString("utf8");
      });

      const settle = (): void => {
        settled = true;
        clearTimeout(timer);
        if (escalation !== null) clearTimeout(escalation);
        live.delete(child);
      };
      child.once("error", (error: Error) => {
        if (settled) return;
        settle();
        reject(cannotRun(command, fileName, error));
      });
      child.once(
        "close",
        (code: number | null, signal: NodeJS.Signals | null) => {
          if (settled) return;
          settle();
          if (aborted) {
            reject(shuttingDown(fileName));
            return;
          }
          if (stoppedBy === null && !splitter.end(onLine))
            stoppedBy = "entries";
          resolve({ code, signal, stderr, stoppedBy });
        },
      );
    });
  }

  async function scanTar(
    tar: string,
    archiveReal: string,
    fileName: string,
    collector: ListingCollector,
    deadline: number,
  ): Promise<ScanOutcome> {
    const env: NodeJS.ProcessEnv = { ...process.env, LC_ALL: "C", TZ: "UTC" };
    delete env.TAR_OPTIONS;
    const result = await runLister(
      tar,
      [
        "--list",
        "--verbose",
        "--full-time",
        "--numeric-owner",
        "--quoting-style=c",
        "--force-local",
        "--file",
        archiveReal,
      ],
      env,
      "latin1",
      deadline,
      fileName,
      (line) => {
        const entry = parseTarLine(line);
        return entry === null || collector.add(entry);
      },
    );
    return outcomeOf(result, collector, () =>
      fmError(
        "archive_failed",
        `${fileName}: tar exited ${String(result.code ?? result.signal)}${
          summarize(result.stderr) === ""
            ? ""
            : ` — ${summarize(result.stderr)}`
        }`,
      ),
    );
  }

  async function scanSevenZip(
    sevenZip: string,
    archiveReal: string,
    fileName: string,
    collector: ListingCollector,
    deadline: number,
  ): Promise<ScanOutcome> {
    const parser = new SevenZipListParser();
    const result = await runLister(
      sevenZip,
      ["l", "-slt", "-sccUTF-8", "-bd", NO_PASSWORD, "--", archiveReal],
      { ...process.env },
      "utf8",
      deadline,
      fileName,
      (line) => {
        const entry = parser.push(line);
        return entry === null || collector.add(entry);
      },
    );
    if (result.stoppedBy === null) {
      const last = parser.end();
      if (last !== null && !collector.add(last)) result.stoppedBy = "entries";
    }
    const reported = parser.problems.join("; ");
    return outcomeOf(
      result,
      collector,
      () => {
        if (/wrong password|encrypted archive/iu.test(result.stderr)) {
          return fmError(
            "archive_failed",
            `${fileName}: its list of files is encrypted — it cannot be shown without the password`,
          );
        }
        const detail = [summarize(result.stderr), reported]
          .filter((part) => part !== "")
          .join("; ");
        return fmError(
          "archive_failed",
          `${fileName}: 7z exited ${String(result.code ?? result.signal)}${detail === "" ? "" : ` — ${detail}`}`,
        );
      },
      (code) => code === 0 || code === 1,
      reported,
    );
  }

  function outcomeOf(
    result: RunResult,
    collector: ListingCollector,
    failure: () => FileManagerError,
    succeeded: (code: number | null) => boolean = (code) => code === 0,
    reported = "",
  ): ScanOutcome {
    if (result.stoppedBy !== null)
      return { stoppedBy: result.stoppedBy, problem: null };
    if (succeeded(result.code)) return { stoppedBy: null, problem: null };
    if (collector.scannedCount > 0) {
      const problem = reported !== "" ? reported : summarize(result.stderr);
      return {
        stoppedBy: "damaged",
        problem: problem === "" ? failure().detail : problem,
      };
    }
    throw failure();
  }

  async function scanZip(
    archiveReal: string,
    sizeBytes: number,
    fileName: string,
    collector: ListingCollector,
    deadline: number,
  ): Promise<{ outcome: ScanOutcome } | { unreadable: string }> {
    let handle: FileHandle;
    try {
      handle = await open(archiveReal, "r");
    } catch (error) {
      throw mapNodeError(error, archiveReal);
    }
    let zipfile: ZipFile;
    try {
      const tailBytes = Math.min(sizeBytes, ZIP_TAIL_BYTES);
      const tail = Buffer.alloc(tailBytes);
      await handle.read(tail, 0, tailBytes, sizeBytes - tailBytes);
      const prefix = zipPrefixLength(tail, sizeBytes - tailBytes);
      zipfile = await fromRandomAccessReaderPromise(
        new WindowedReader(handle, prefix),
        sizeBytes - prefix,
        {
          decodeStrings: false,
          validateEntrySizes: false,
          autoClose: true,
        },
      );
    } catch (error) {
      await handle.close().catch(() => undefined);
      return {
        unreadable: error instanceof Error ? error.message : String(error),
      };
    }
    zipfile.on("error", () => undefined);

    try {
      for await (const entry of zipfile.eachEntry()) {
        if (disposed) throw shuttingDown(fileName);
        if (Date.now() >= deadline)
          return { outcome: { stoppedBy: "time", problem: null } };
        if (!collector.add(zipEntryFrom(entry))) {
          return { outcome: { stoppedBy: "entries", problem: null } };
        }
      }
      return { outcome: { stoppedBy: null, problem: null } };
    } catch (error) {
      if (isFileManagerError(error)) throw error;
      const message = error instanceof Error ? error.message : String(error);
      if (collector.scannedCount === 0) return { unreadable: message };
      return { outcome: { stoppedBy: "damaged", problem: message } };
    } finally {
      zipfile.close();
    }
  }

  async function listArchive(input: { path: string }): Promise<ArchiveListing> {
    const archiveReal = await resolveExisting(input.path);
    let stats: Stats;
    try {
      stats = await stat(archiveReal);
    } catch (error) {
      throw mapNodeError(error, archiveReal);
    }
    if (!stats.isFile()) throw fmError("not_a_file", archiveReal);

    const fileName = path.basename(archiveReal);
    const format = detectArchiveFormat(fileName);
    if (format === null) throw fmError("unsupported_archive", fileName);

    const collector = new ListingCollector(limits);
    const deadline = Date.now() + limits.timeoutMs;
    let outcome: ScanOutcome;

    if (format === "zip") {
      const zip = await scanZip(
        archiveReal,
        stats.size,
        fileName,
        collector,
        deadline,
      );
      if ("outcome" in zip) {
        outcome = zip.outcome;
      } else if (executables.sevenZip !== null) {
        bb.log.info(
          `list ${fileName}: yauzl could not read it (${zip.unreadable}); trying 7z`,
        );
        outcome = await scanSevenZip(
          executables.sevenZip,
          archiveReal,
          fileName,
          collector,
          deadline,
        );
      } else {
        throw fmError(
          "archive_failed",
          `${fileName}: not a readable zip archive (${zip.unreadable})`,
        );
      }
    } else if (format === "7z" || format === "rar") {
      if (executables.sevenZip === null) {
        throw fmError(
          "unsupported_archive",
          `${fileName} (7z is not installed on this host)`,
        );
      }
      outcome = await scanSevenZip(
        executables.sevenZip,
        archiveReal,
        fileName,
        collector,
        deadline,
      );
    } else {
      if (executables.tar === null) {
        throw fmError(
          "unsupported_archive",
          `${fileName} (tar is not installed on this host)`,
        );
      }
      outcome = await scanTar(
        executables.tar,
        archiveReal,
        fileName,
        collector,
        deadline,
      );
    }

    if (outcome.stoppedBy !== null && outcome.stoppedBy !== "entries") {
      bb.log.info(
        `list ${fileName}: stopped (${outcome.stoppedBy}) after ${String(collector.scannedCount)} members`,
      );
    }

    return {
      path: archiveReal,
      format,
      archiveSizeBytes: stats.size,
      ...collector.finish(outcome.stoppedBy, outcome.problem),
      extractable: options.canExtract(format),
    };
  }

  bb.onDispose(() => {
    disposed = true;
    const running = [...live.values()];
    for (const stop of running) stop();
    if (running.length > 0) {
      bb.log.info(
        `archive listing disposed — stopped ${String(running.length)} lister(s)`,
      );
    }
  });

  return { listArchive };
}
