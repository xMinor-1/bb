import { crc32 } from "node:zlib";

import type {
  ArchiveEntry,
  ArchiveEntryKind,
  ArchiveStopReason,
} from "../contract";

const CP866_HIGH =
  "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ" +
  "абвгдежзийклмноп░▒▓│┤╡╢╖╕╣║╗╝╜╛┐" +
  "└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀" +
  "рстуфхцчшщъыьэюяЁёЄєЇїЎў°∙·√№¤■ ";

export function decodeCp866(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) {
    text +=
      byte < 0x80
        ? String.fromCharCode(byte)
        : (CP866_HIGH[byte - 0x80] ?? "�");
  }
  return text;
}

const strictUtf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const lenientUtf8 = new TextDecoder("utf-8", { ignoreBOM: true });

export function decodeLegacyName(bytes: Uint8Array): string {
  try {
    return strictUtf8.decode(bytes);
  } catch {
    return decodeCp866(bytes);
  }
}

export interface ZipExtraField {
  id: number;
  data: Uint8Array;
}

const ZIP_UTF8_FLAG = 0x0800;
const UNICODE_PATH_FIELD = 0x7075;

function unicodePathName(
  raw: Uint8Array,
  extraFields: readonly ZipExtraField[],
): string | null {
  const field = extraFields.find(
    (candidate) => candidate.id === UNICODE_PATH_FIELD,
  );
  if (field === undefined || field.data.length < 5 || field.data[0] !== 1)
    return null;
  const view = new DataView(
    field.data.buffer,
    field.data.byteOffset,
    field.data.byteLength,
  );
  if (view.getUint32(1, true) !== crc32(raw)) return null;
  return lenientUtf8.decode(field.data.subarray(5));
}

export function decodeZipName(
  raw: Uint8Array,
  flags: number,
  extraFields: readonly ZipExtraField[],
): string {
  const name =
    unicodePathName(raw, extraFields) ??
    ((flags & ZIP_UTF8_FLAG) !== 0
      ? lenientUtf8.decode(raw)
      : decodeLegacyName(raw));
  return name.replaceAll("\\", "/");
}

function withoutTrailingSlash(name: string): string {
  return name.length > 1 && name.endsWith("/") ? name.slice(0, -1) : name;
}

export interface ZipRecord {
  fileNameRaw: Uint8Array;
  generalPurposeBitFlag: number;
  extraFields: readonly ZipExtraField[];
  versionMadeBy: number;
  externalFileAttributes: number;
  uncompressedSize: number;
  lastModFileDate: number;
  getLastModDate(): Date;
}

const UNIX_HOSTS: ReadonlySet<number> = new Set([3, 19]);
const S_IFMT = 0o170000;
const S_IFDIR = 0o040000;
const S_IFREG = 0o100000;
const S_IFLNK = 0o120000;
const ZIP_TIME_FIELDS: ReadonlySet<number> = new Set([0x5455, 0x000a]);

export function zipEntryKind(
  name: string,
  versionMadeBy: number,
  externalAttributes: number,
): ArchiveEntryKind {
  const host = versionMadeBy >>> 8;
  if (UNIX_HOSTS.has(host)) {
    const type = (externalAttributes >>> 16) & S_IFMT;
    if (type === S_IFLNK) return "symlink";
    if (type === S_IFDIR) return "directory";
    if (type !== 0 && type !== S_IFREG && !name.endsWith("/")) return "other";
  } else if ((externalAttributes & 0x10) !== 0) {
    return "directory";
  }
  return name.endsWith("/") ? "directory" : "file";
}

export function zipModifiedAt(record: ZipRecord): number | null {
  const hasUtcField = record.extraFields.some((field) =>
    ZIP_TIME_FIELDS.has(field.id),
  );
  if (record.lastModFileDate === 0 && !hasUtcField) return null;
  const time = record.getLastModDate().getTime();
  return Number.isFinite(time) ? time : null;
}

const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_RECORD_SIGNATURE = 0x06064b50;
const EOCD_BYTES = 22;
const ZIP64_LOCATOR_BYTES = 20;
const ZIP64_RECORD_BYTES = 56;
export const ZIP_TAIL_BYTES =
  EOCD_BYTES + 0xffff + ZIP64_LOCATOR_BYTES + ZIP64_RECORD_BYTES;

export function zipPrefixLength(tail: Uint8Array, tailStart: number): number {
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  for (let at = tail.length - EOCD_BYTES; at >= 0; at -= 1) {
    if (view.getUint32(at, true) !== EOCD_SIGNATURE) continue;
    if (at + EOCD_BYTES + view.getUint16(at + 20, true) !== tail.length)
      continue;
    const directoryBytes = view.getUint32(at + 12, true);
    const directoryOffset = view.getUint32(at + 16, true);
    if (directoryBytes !== 0xffffffff && directoryOffset !== 0xffffffff) {
      return Math.max(0, tailStart + at - (directoryOffset + directoryBytes));
    }
    const locator = at - ZIP64_LOCATOR_BYTES;
    if (
      locator < 0 ||
      view.getUint32(locator, true) !== ZIP64_LOCATOR_SIGNATURE
    )
      return 0;
    const recordOffset = Number(view.getBigUint64(locator + 8, true));
    for (let record = locator - ZIP64_RECORD_BYTES; record >= 0; record -= 1) {
      if (view.getUint32(record, true) === ZIP64_RECORD_SIGNATURE) {
        return Math.max(0, tailStart + record - recordOffset);
      }
    }
    return 0;
  }
  return 0;
}

export function zipEntryFrom(record: ZipRecord): ArchiveEntry {
  const name = decodeZipName(
    record.fileNameRaw,
    record.generalPurposeBitFlag,
    record.extraFields,
  );
  const kind = zipEntryKind(
    name,
    record.versionMadeBy,
    record.externalFileAttributes,
  );
  return {
    path: kind === "directory" ? withoutTrailingSlash(name) : name,
    kind,
    sizeBytes: kind === "directory" ? 0 : record.uncompressedSize,
    modifiedAtMs: zipModifiedAt(record),
    encrypted: (record.generalPurposeBitFlag & 0x1) !== 0,
    linkTarget: null,
  };
}

const C_ESCAPES: Readonly<Record<string, number>> = {
  a: 0x07,
  b: 0x08,
  f: 0x0c,
  n: 0x0a,
  r: 0x0d,
  t: 0x09,
  v: 0x0b,
  "\\": 0x5c,
  '"': 0x22,
  "'": 0x27,
  "?": 0x3f,
};

export function readCQuoted(
  line: string,
  start: number,
): { bytes: Uint8Array; end: number } | null {
  if (line[start] !== '"') return null;
  const bytes: number[] = [];
  let index = start + 1;
  while (index < line.length) {
    const char = line[index] as string;
    if (char === '"') return { bytes: Uint8Array.from(bytes), end: index + 1 };
    if (char !== "\\") {
      bytes.push(char.charCodeAt(0) & 0xff);
      index += 1;
      continue;
    }
    const next = line[index + 1];
    if (next === undefined) return null;
    const simple = C_ESCAPES[next];
    if (simple !== undefined) {
      bytes.push(simple);
      index += 2;
      continue;
    }
    if (next >= "0" && next <= "7") {
      let value = 0;
      let digits = 0;
      while (digits < 3) {
        const digit = line[index + 1 + digits];
        if (digit === undefined || digit < "0" || digit > "7") break;
        value = value * 8 + (digit.charCodeAt(0) - 48);
        digits += 1;
      }
      bytes.push(value & 0xff);
      index += 1 + digits;
      continue;
    }
    bytes.push(next.charCodeAt(0) & 0xff);
    index += 2;
  }
  return null;
}

const TAR_TYPES: Readonly<Record<string, ArchiveEntryKind | null>> = {
  "-": "file",
  d: "directory",
  l: "symlink",
  h: "hardlink",
  c: "other",
  b: "other",
  p: "other",
  s: "other",
  C: "file",
  M: "file",
  V: null,
};

function tarTimestamp(parts: readonly string[]): number | null {
  if (parts.length === 1)
    return /^-?\d+$/u.test(parts[0] ?? "") ? Number(parts[0]) * 1000 : null;
  if (parts.length !== 2) return null;
  const date = /^(-?\d{4,})-(\d{2})-(\d{2})$/u.exec(parts[0] ?? "");
  const time = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/u.exec(
    parts[1] ?? "",
  );
  if (date === null || time === null) return null;
  const milliseconds =
    time[4] === undefined ? 0 : Number(time[4].slice(0, 3).padEnd(3, "0"));
  const value = Date.UTC(
    Number(date[1]),
    Number(date[2]) - 1,
    Number(date[3]),
    Number(time[1]),
    Number(time[2]),
    Number(time[3] ?? 0),
    milliseconds,
  );
  return Number.isFinite(value) ? value : null;
}

export function parseTarLine(line: string): ArchiveEntry | null {
  const kind = TAR_TYPES[line[0] ?? ""];
  if (kind === undefined || kind === null) return null;
  const quote = line.indexOf('"');
  if (quote < 0) return null;
  const columns = line.slice(0, quote).trim().split(/\s+/u);
  if (columns.length < 4) return null;
  const name = readCQuoted(line, quote);
  if (name === null) return null;

  let linkTarget: string | null = null;
  const marker =
    kind === "symlink" ? " -> " : kind === "hardlink" ? " link to " : null;
  if (marker !== null && line.startsWith(marker, name.end)) {
    const target = readCQuoted(line, name.end + marker.length);
    if (target !== null) linkTarget = decodeLegacyName(target.bytes);
  }

  const sizeColumn = columns[2] ?? "";
  const path = decodeLegacyName(name.bytes);
  return {
    path: kind === "directory" ? withoutTrailingSlash(path) : path,
    kind,
    sizeBytes:
      kind === "file" && /^\d+$/u.test(sizeColumn) ? Number(sizeColumn) : 0,
    modifiedAtMs: tarTimestamp(columns.slice(3)),
    encrypted: false,
    linkTarget,
  };
}

const SEVEN_ZIP_SEPARATOR = "----------";
const SEVEN_ZIP_PROPERTY =
  /^([A-Z][A-Za-z0-9_-]*(?: [A-Za-z0-9_-]+)*) = (.*)$/u;
const UNIX_MODE = /^[-dlcbps][-rwxsStT]{9}$/u;

export function parseSevenZipTime(value: string): number | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/u.exec(
      value.trim(),
    );
  if (match === null) return null;
  const milliseconds =
    match[7] === undefined ? 0 : Number(match[7].slice(0, 3).padEnd(3, "0"));
  const time = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] ?? 0),
    milliseconds,
  ).getTime();
  return Number.isFinite(time) ? time : null;
}

export function sevenZipEntryFrom(
  block: ReadonlyMap<string, string>,
): ArchiveEntry | null {
  const rawPath = block.get("Path");
  if (rawPath === undefined || rawPath === "") return null;

  const attributes = (block.get("Attributes") ?? "").trim().split(/\s+/u);
  const windows = /^[A-Z_]+$/u.test(attributes[0] ?? "")
    ? (attributes[0] as string)
    : "";
  const unix = attributes.find((token) => UNIX_MODE.test(token)) ?? "";
  const symlinkTarget = block.get("Symbolic Link") ?? "";
  const hardlinkTarget = block.get("Hard Link") ?? "";

  let kind: ArchiveEntryKind = "file";
  if (
    block.get("Folder") === "+" ||
    windows.includes("D") ||
    unix.startsWith("d")
  ) {
    kind = "directory";
  } else if (symlinkTarget !== "" || unix.startsWith("l")) {
    kind = "symlink";
  } else if (hardlinkTarget !== "") {
    kind = "hardlink";
  } else if (unix !== "" && !unix.startsWith("-")) {
    kind = "other";
  }

  const size = block.get("Size") ?? "";
  return {
    path: kind === "directory" ? withoutTrailingSlash(rawPath) : rawPath,
    kind,
    sizeBytes: kind === "file" && /^\d+$/u.test(size) ? Number(size) : 0,
    modifiedAtMs: parseSevenZipTime(block.get("Modified") ?? ""),
    encrypted: block.get("Encrypted") === "+",
    linkTarget:
      kind === "symlink" && symlinkTarget !== ""
        ? symlinkTarget
        : kind === "hardlink"
          ? hardlinkTarget
          : null,
  };
}

export class SevenZipListParser {
  readonly problems: string[] = [];
  private inMembers = false;
  private inErrors = false;
  private block = new Map<string, string>();
  private lastKey: string | null = null;

  push(line: string): ArchiveEntry | null {
    if (!this.inMembers) {
      if (line === SEVEN_ZIP_SEPARATOR) {
        this.inMembers = true;
      } else if (line === "ERRORS:") {
        this.inErrors = true;
      } else if (this.inErrors) {
        if (line === "" || SEVEN_ZIP_PROPERTY.test(line)) this.inErrors = false;
        else if (this.problems.length < 4) this.problems.push(line.trim());
      }
      return null;
    }
    if (line === "") return this.flush();
    const property = SEVEN_ZIP_PROPERTY.exec(line);
    if (property !== null) {
      const key = property[1] as string;
      this.block.set(key, property[2] as string);
      this.lastKey = key;
      return null;
    }
    if (this.lastKey === "Path") {
      this.block.set("Path", `${this.block.get("Path") ?? ""}\n${line}`);
    }
    return null;
  }

  end(): ArchiveEntry | null {
    return this.inMembers ? this.flush() : null;
  }

  private flush(): ArchiveEntry | null {
    const entry = this.block.size === 0 ? null : sevenZipEntryFrom(this.block);
    this.block = new Map();
    this.lastKey = null;
    return entry;
  }
}

export class LineSplitter {
  private pieces: Buffer[] = [];
  private pendingBytes = 0;
  private skipping = false;

  constructor(
    private readonly maxLineBytes: number,
    private readonly encoding: "latin1" | "utf8",
  ) {}

  push(chunk: Buffer, onLine: (line: string) => boolean): boolean {
    let start = 0;
    for (;;) {
      const newline = chunk.indexOf(0x0a, start);
      if (newline < 0) {
        this.hold(chunk.subarray(start));
        return true;
      }
      this.hold(chunk.subarray(start, newline));
      start = newline + 1;
      const line = this.take();
      if (line !== null && !onLine(line)) return false;
    }
  }

  end(onLine: (line: string) => boolean): boolean {
    if (this.pendingBytes === 0 && !this.skipping) return true;
    const line = this.take();
    return line === null ? true : onLine(line);
  }

  private hold(piece: Buffer): void {
    if (this.skipping || piece.length === 0) return;
    if (this.pendingBytes + piece.length > this.maxLineBytes) {
      this.pieces = [];
      this.pendingBytes = 0;
      this.skipping = true;
      return;
    }
    this.pieces.push(piece);
    this.pendingBytes += piece.length;
  }

  private take(): string | null {
    const skipped = this.skipping;
    const line = skipped
      ? null
      : Buffer.concat(this.pieces, this.pendingBytes).toString(this.encoding);
    this.pieces = [];
    this.pendingBytes = 0;
    this.skipping = false;
    return line;
  }
}

export interface CollectorLimits {
  maxEntries: number;
  maxScanned: number;
  maxDirectories: number;
}

export interface ListingTotals {
  entries: ArchiveEntry[];
  totalEntries: number;
  fileCount: number;
  directoryCount: number;
  uncompressedBytes: number;
  encryptedCount: number;
  truncated: boolean;
  partial: boolean;
  stoppedBy: ArchiveStopReason | null;
  problem: string | null;
}

export function memberSegments(path: string): string[] {
  const segments = path
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".");
  return path.startsWith("/") ? ["/", ...segments] : segments;
}

export class ListingCollector {
  readonly entries: ArchiveEntry[] = [];
  private scanned = 0;
  private files = 0;
  private bytes = 0;
  private encrypted = 0;
  private readonly directories = new Set<string>();

  constructor(private readonly limits: CollectorLimits) {}

  get scannedCount(): number {
    return this.scanned;
  }

  add(entry: ArchiveEntry): boolean {
    if (this.scanned >= this.limits.maxScanned) return false;

    const segments = memberSegments(entry.path);
    const depth =
      entry.kind === "directory" ? segments.length : segments.length - 1;
    const missing: string[] = [];
    let prefix = "";
    for (let index = 0; index < depth; index += 1) {
      prefix =
        index === 0
          ? (segments[0] as string)
          : `${prefix}/${segments[index] as string}`;
      if (!this.directories.has(prefix)) missing.push(prefix);
    }
    if (this.directories.size + missing.length > this.limits.maxDirectories)
      return false;
    for (const folder of missing) this.directories.add(folder);

    this.scanned += 1;
    if (entry.kind !== "directory") {
      this.files += 1;
      this.bytes += entry.sizeBytes;
    }
    if (entry.encrypted) this.encrypted += 1;
    if (this.entries.length < this.limits.maxEntries) this.entries.push(entry);
    return true;
  }

  finish(
    stoppedBy: ArchiveStopReason | null,
    problem: string | null = null,
  ): ListingTotals {
    const partial = stoppedBy !== null;
    return {
      entries: this.entries,
      totalEntries: this.scanned,
      fileCount: this.files,
      directoryCount: this.directories.size,
      uncompressedBytes: this.bytes,
      encryptedCount: this.encrypted,
      truncated: partial || this.entries.length < this.scanned,
      partial,
      stoppedBy,
      problem: stoppedBy === "damaged" ? problem : null,
    };
  }
}
