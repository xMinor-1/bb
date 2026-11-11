import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import type { BbPluginApi } from "@get-bb/plugin-sdk";

import type { ArchiveFormat, ArchiveListing, Job } from "../contract";
import {
  createArchiveLister,
  type ListingLimits,
  type SpawnLister,
} from "./archive-listing";
import { fmError, mapNodeError } from "./errors";
import type { JobsModule } from "./jobs";
import { detectArchiveFormat } from "./listing";
import { uniqueName } from "./mutations";
import {
  isInside,
  resolveExisting,
  resolveExistingDir,
  resolveNew,
  validateName,
} from "./root";
import type { SettingsModule } from "./settings";
import { publishFs } from "./signals";

export interface ArchiveSupport {
  zip: boolean;
  tar: boolean;
  sevenZip: boolean;
  rar: boolean;
}

export interface Executables {
  tar: string | null;
  unzip: string | null;
  sevenZip: string | null;
  sevenZipRar: boolean;
}

async function findExecutable(name: string): Promise<string | null> {
  const parts = (process.env.PATH ?? "")
    .split(path.delimiter)
    .filter((entry) => entry !== "");
  for (const dir of parts) {
    const candidate = path.join(dir, name);
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}

async function firstExecutable(
  names: readonly string[],
): Promise<string | null> {
  for (const name of names) {
    const found = await findExecutable(name);
    if (found) return found;
  }
  return null;
}

export function hasRarCodec(output: string): boolean {
  let inCodecs = false;
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!inCodecs) {
      inCodecs = trimmed === "Codecs:";
      continue;
    }
    if (trimmed === "") break;
    if (/(?:^|\s)Rar\d*$/u.test(trimmed)) return true;
  }
  return false;
}

const RAR_PROBE_TIMEOUT_MS = 5_000;
const RAR_PROBE_OUTPUT_LIMIT = 1024 * 1024;

export function probeRarCodec(sevenZip: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let output = "";
    let settled = false;
    const finish = (value: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(sevenZip, ["i"], { stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(false);
    }, RAR_PROBE_TIMEOUT_MS);
    timer.unref?.();
    child.stdout?.on("data", (piece: Buffer) => {
      if (output.length < RAR_PROBE_OUTPUT_LIMIT)
        output += piece.toString("utf8");
    });
    child.once("error", () => finish(false));
    child.once("close", (code) => finish(code === 0 && hasRarCodec(output)));
  });
}

export async function probeExecutables(): Promise<Executables> {
  const [tar, unzip, sevenZip] = await Promise.all([
    findExecutable("tar"),
    findExecutable("unzip"),
    firstExecutable(["7z", "7za", "7zz"]),
  ]);
  const sevenZipRar = sevenZip === null ? false : await probeRarCodec(sevenZip);
  return { tar, unzip, sevenZip, sevenZipRar };
}

export function supportFrom(executables: Executables): ArchiveSupport {
  return {
    zip: executables.unzip !== null || executables.sevenZip !== null,
    tar: executables.tar !== null,
    sevenZip: executables.sevenZip !== null,
    rar: executables.sevenZip !== null && executables.sevenZipRar,
  };
}

const ARCHIVE_SUFFIXES: readonly string[] = [
  ".tar.gz",
  ".tar.bz2",
  ".tar.xz",
  ".tgz",
  ".tbz2",
  ".tbz",
  ".txz",
  ".zip",
  ".tar",
  ".7z",
  ".rar",
];

export function archiveBaseName(fileName: string): string {
  const lower = fileName.toLowerCase();
  for (const suffix of ARCHIVE_SUFFIXES) {
    if (lower.length > suffix.length && lower.endsWith(suffix)) {
      return fileName.slice(0, fileName.length - suffix.length);
    }
  }
  return fileName;
}

interface ExtractionPlan {
  command: string;
  args: string[];
  acceptsExitCode(code: number | null): boolean;
}

function planFor(
  format: ArchiveFormat,
  executables: Executables,
  archivePath: string,
  outDir: string,
): ExtractionPlan | null {
  const sevenZipPlan = (): ExtractionPlan | null =>
    executables.sevenZip === null
      ? null
      : {
          command: executables.sevenZip,
          args: ["x", "-y", "-bd", `-o${outDir}`, "--", archivePath],
          acceptsExitCode: (code) => code === 0 || code === 1,
        };

  if (format === "zip") {
    if (executables.unzip !== null) {
      return {
        command: executables.unzip,
        args: ["-qq", "-o", archivePath, "-d", outDir],
        acceptsExitCode: (code) => code === 0 || code === 1,
      };
    }
    return sevenZipPlan();
  }

  if (format === "7z") return sevenZipPlan();
  if (format === "rar") return executables.sevenZipRar ? sevenZipPlan() : null;

  if (executables.tar === null) return null;
  return {
    command: executables.tar,
    args: [
      "-x",
      "-f",
      archivePath,
      "-C",
      outDir,
      "--no-same-owner",
      "--no-same-permissions",
    ],
    acceptsExitCode: (code) => code === 0,
  };
}

export interface ExtractorProcess {
  readonly stderr: NodeJS.ReadableStream | null;
  kill(signal?: NodeJS.Signals | number): boolean;
  once(
    event: "close",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): unknown;
  once(event: "error", listener: (error: Error) => void): unknown;
}

export type SpawnExtractor = (
  command: string,
  args: readonly string[],
  options: { cwd: string },
) => ExtractorProcess;

const defaultSpawn: SpawnExtractor = (command, args, options) =>
  spawn(command, [...args], {
    cwd: options.cwd,
    stdio: ["ignore", "ignore", "pipe"],
  });

const STDERR_LIMIT = 8 * 1024;
const KILL_ESCALATION_MS = 3_000;
const STALE_STAGING_PATTERN = /^\.bb-extract-[0-9a-f]{1,16}$/u;
const STALE_STAGING_MS = 60 * 60 * 1000;

export interface ExtractArchiveInput {
  archivePath: string;
  destinationDir: string | null;
  createSubfolder: boolean;
  conflict: "rename" | "overwrite" | "fail";
}

export interface ArchivesModule {
  extractArchive(input: ExtractArchiveInput): Promise<{ job: Job }>;
  listArchive(input: { path: string }): Promise<ArchiveListing>;
  readonly support: ArchiveSupport;
  idle(): Promise<void>;
}

export interface ArchivesOptions {
  jobs: JobsModule;
  settings?: Pick<SettingsModule, "chunkSizeBytes">;
  spawnExtractor?: SpawnExtractor;
  spawnLister?: SpawnLister;
  listingLimits?: Partial<ListingLimits>;
  executables?: Executables;
}

export function canExtractFormat(
  format: ArchiveFormat,
  executables: Executables,
): boolean {
  return planFor(format, executables, "", "") !== null;
}

export async function createArchives(
  bb: BbPluginApi,
  options: ArchivesOptions,
): Promise<ArchivesModule> {
  const jobs = options.jobs;
  const spawnExtractor = options.spawnExtractor ?? defaultSpawn;
  const executables = options.executables ?? (await probeExecutables());
  const support = supportFrom(executables);
  const lister = createArchiveLister(bb, {
    executables,
    canExtract: (format) => canExtractFormat(format, executables),
    ...(options.spawnLister === undefined
      ? {}
      : { spawnLister: options.spawnLister }),
    ...(options.listingLimits === undefined
      ? {}
      : { limits: options.listingLimits }),
  });
  const running = new Set<Promise<void>>();
  const staging = new Map<string, string>();

  async function sweepSymlinks(
    target: string,
    removed: string[],
  ): Promise<void> {
    let dirents;
    try {
      dirents = await readdir(target, { withFileTypes: true });
    } catch {
      return;
    }
    for (const dirent of dirents) {
      const full = path.join(target, dirent.name);
      if (!isInside(full) || !full.startsWith(target + path.sep)) {
        await rm(full, { recursive: true, force: true }).catch(() => undefined);
        removed.push(full);
        continue;
      }
      if (dirent.isSymbolicLink()) {
        if (!(await linkStaysInsideRoot(full))) {
          await rm(full, { force: true }).catch(() => undefined);
          removed.push(full);
        }
        continue;
      }
      if (dirent.isDirectory()) await sweepSymlinks(full, removed);
    }
  }

  async function linkStaysInsideRoot(linkPath: string): Promise<boolean> {
    try {
      return isInside(await realpath(linkPath));
    } catch {}
    try {
      const raw = await readlink(linkPath);
      const resolved = path.resolve(path.dirname(linkPath), raw);
      return isInside(resolved);
    } catch {
      return false;
    }
  }

  async function exists(candidate: string): Promise<boolean> {
    try {
      await lstat(candidate);
      return true;
    } catch {
      return false;
    }
  }

  async function claim(
    destReal: string,
    desiredName: string,
    conflict: ExtractArchiveInput["conflict"],
  ): Promise<string> {
    const naive = await resolveNew(destReal, validateName(desiredName));
    if (!(await exists(naive))) return naive;
    if (conflict === "fail") throw fmError("exists", naive);
    if (conflict === "rename") {
      return resolveNew(destReal, await uniqueName(destReal, desiredName));
    }
    await rm(naive, { recursive: true, force: true }).catch(
      (error: unknown) => {
        throw mapNodeError(error, naive);
      },
    );
    return naive;
  }

  async function moveInto(source: string, target: string): Promise<void> {
    try {
      await rename(source, target);
    } catch (error) {
      throw mapNodeError(error, target);
    }
  }

  async function rollback(
    moved: readonly { source: string; target: string }[],
  ): Promise<void> {
    for (let index = moved.length - 1; index >= 0; index -= 1) {
      const entry = moved[index];
      if (entry === undefined) continue;
      try {
        await rename(entry.target, entry.source);
      } catch (error) {
        bb.log.warn(
          `extract rollback failed for ${entry.target}: ${String(error)}`,
        );
      }
    }
  }

  async function extractArchive(
    input: ExtractArchiveInput,
  ): Promise<{ job: Job }> {
    const archiveReal = await resolveExisting(input.archivePath);
    const archiveStat = await stat(archiveReal).catch((error: unknown) => {
      throw mapNodeError(error, archiveReal);
    });
    if (!archiveStat.isFile()) throw fmError("not_a_file", archiveReal);

    const fileName = path.basename(archiveReal);
    const format = detectArchiveFormat(fileName);
    if (format === null) throw fmError("unsupported_archive", fileName);

    const destReal = await resolveExistingDir(
      input.destinationDir === null || input.destinationDir === ""
        ? path.dirname(archiveReal)
        : input.destinationDir,
    );

    if (planFor(format, executables, archiveReal, destReal) === null) {
      throw fmError(
        "unsupported_archive",
        `${fileName} (no extractor for ${format} on this host)`,
      );
    }

    const job = jobs.create({
      kind: "extract",
      label: `Extracting "${fileName}"`,
      subject: fileName,
      totalBytes: archiveStat.size,
    });

    const task = run(job.jobId, {
      archiveReal,
      fileName,
      format,
      destReal,
      createSubfolder: input.createSubfolder,
      conflict: input.conflict,
    }).catch((error: unknown) => {
      const mapped = mapNodeError(error, fileName);
      jobs.fail(job.jobId, mapped.code, mapped.detail);
    });
    running.add(task);
    void task.finally(() => running.delete(task));

    return { job };
  }

  interface RunContext {
    archiveReal: string;
    fileName: string;
    format: ArchiveFormat;
    destReal: string;
    createSubfolder: boolean;
    conflict: ExtractArchiveInput["conflict"];
  }

  async function run(jobId: string, context: RunContext): Promise<void> {
    const stagingName = `.bb-extract-${Math.random().toString(16).slice(2, 10)}`;
    const stagingRoot = await resolveNew(context.destReal, stagingName);
    const outDir = path.join(stagingRoot, "out");
    staging.set(jobId, stagingRoot);

    try {
      await sweepStaleStaging(context.destReal);
      await mkdir(outDir, { recursive: true });

      const plan = planFor(
        context.format,
        executables,
        context.archiveReal,
        outDir,
      );
      if (plan === null) {
        jobs.fail(jobId, "unsupported_archive", context.fileName);
        return;
      }

      const result = await runProcess(jobId, plan, outDir);
      if (jobs.isCanceled(jobId)) return;

      if (!plan.acceptsExitCode(result.code)) {
        const detail = result.stderr.trim().split("\n").slice(0, 4).join("; ");
        jobs.fail(
          jobId,
          "archive_failed",
          `${context.fileName}: ${path.basename(plan.command)} exited ${String(result.code ?? result.signal)}${detail ? ` — ${detail}` : ""}`,
        );
        return;
      }

      const removed: string[] = [];
      for (const name of await readdir(stagingRoot)) {
        if (name === "out") continue;
        const escaped = path.join(stagingRoot, name);
        await rm(escaped, { recursive: true, force: true }).catch(
          () => undefined,
        );
        removed.push(escaped);
      }

      const targets: string[] = [];
      let resultPath: string;
      if (context.createSubfolder) {
        const target = await claim(
          context.destReal,
          archiveBaseName(context.fileName),
          context.conflict,
        );
        await moveInto(outDir, target);
        targets.push(target);
        resultPath = target;
      } else {
        const names = (await readdir(outDir)).sort();
        for (const name of names) validateName(name);
        if (context.conflict === "fail") {
          for (const name of names) {
            if (await exists(path.join(context.destReal, name))) {
              throw fmError("exists", path.join(context.destReal, name));
            }
          }
        }
        const moved: { source: string; target: string }[] = [];
        try {
          for (const name of names) {
            const source = path.join(outDir, name);
            const target = await claim(
              context.destReal,
              name,
              context.conflict,
            );
            await moveInto(source, target);
            moved.push({ source, target });
            targets.push(target);
          }
        } catch (error) {
          await rollback(moved);
          throw error;
        }
        resultPath = context.destReal;
      }

      for (const target of targets) {
        const st = await lstat(target).catch(() => null);
        if (st === null) continue;
        if (st.isSymbolicLink()) {
          if (!(await linkStaysInsideRoot(target))) {
            await rm(target, { force: true }).catch(() => undefined);
            removed.push(target);
          }
          continue;
        }
        if (st.isDirectory()) await sweepSymlinks(target, removed);
      }

      if (removed.length > 0) {
        bb.log.warn(
          `extract ${context.fileName}: removed ${removed.length} escaping entr${removed.length === 1 ? "y" : "ies"} (${removed.slice(0, 5).join(", ")})`,
        );
      }

      if (jobs.isCanceled(jobId)) return;
      publishFs(bb, [context.destReal], "extract");
      jobs.succeed(jobId, resultPath);
    } catch (error) {
      if (!jobs.isCanceled(jobId)) {
        const mapped = mapNodeError(error, context.fileName);
        jobs.fail(
          jobId,
          mapped.code === "io_error" ? "archive_failed" : mapped.code,
          mapped.detail,
        );
      }
    } finally {
      staging.delete(jobId);
      await rm(stagingRoot, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
  }

  async function sweepStaleStaging(destReal: string): Promise<void> {
    const own = new Set(staging.values());
    let names: string[];
    try {
      names = await readdir(destReal);
    } catch {
      return;
    }
    for (const name of names) {
      if (!STALE_STAGING_PATTERN.test(name)) continue;
      const candidate = path.join(destReal, name);
      if (own.has(candidate)) continue;
      try {
        const info = await lstat(candidate);
        if (!info.isDirectory() || Date.now() - info.mtimeMs < STALE_STAGING_MS)
          continue;
      } catch {
        continue;
      }
      await rm(candidate, { recursive: true, force: true }).catch(
        () => undefined,
      );
      bb.log.warn(`extract: removed abandoned staging directory ${candidate}`);
    }
  }

  interface ProcessResult {
    code: number | null;
    signal: NodeJS.Signals | null;
    stderr: string;
  }

  function runProcess(
    jobId: string,
    plan: ExtractionPlan,
    cwd: string,
  ): Promise<ProcessResult> {
    return new Promise<ProcessResult>((resolve, reject) => {
      let child: ExtractorProcess;
      try {
        child = spawnExtractor(plan.command, plan.args, { cwd });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }

      let stderr = "";
      child.stderr?.on("data", (piece: unknown) => {
        if (stderr.length >= STDERR_LIMIT) return;
        stderr += String(piece);
      });

      let settled = false;
      child.once("error", (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      });
      child.once(
        "close",
        (code: number | null, signal: NodeJS.Signals | null) => {
          if (settled) return;
          settled = true;
          resolve({ code, signal, stderr });
        },
      );

      jobs.onCancel(jobId, () => {
        child.kill("SIGTERM");
        const escalation = setTimeout(() => {
          child.kill("SIGKILL");
        }, KILL_ESCALATION_MS);
        escalation.unref?.();
      });
    });
  }

  async function idle(): Promise<void> {
    while (running.size > 0) {
      await Promise.allSettled([...running]);
    }
  }

  bb.onDispose(async () => {
    const pending = [...staging.entries()];
    for (const [jobId] of pending) jobs.jobCancel({ jobId });
    for (const [jobId, stagingRoot] of pending) {
      staging.delete(jobId);
      await rm(stagingRoot, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
    if (pending.length > 0) {
      bb.log.info(
        `archives disposed — stopped ${String(pending.length)} extraction(s)`,
      );
    }
  });

  bb.log.info(
    `archive support — zip:${support.zip} tar:${support.tar} 7z:${support.sevenZip} rar:${support.rar}`,
  );

  return { extractArchive, listArchive: lister.listArchive, support, idle };
}
