import { lstat, readdir, readlink, realpath } from "node:fs/promises";
import { userInfo } from "node:os";
import path from "node:path";
import type { Dirent, Stats } from "node:fs";

import type { ArchiveFormat, EntryKind } from "../contract";
import { mapNodeError } from "./errors";
import { detectArchiveFormat, entryFrom } from "./listing";
import {
  assertInside,
  getRoot,
  isInside,
  isStagingPath,
  normalize,
  parentOf,
  resolveExistingDir,
  resolveLink,
} from "./root";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  txt: "text/plain",
  log: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  mdx: "text/markdown",
  rst: "text/x-rst",
  tex: "application/x-tex",
  rtf: "application/rtf",
  pdf: "application/pdf",
  epub: "application/epub+zip",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  json: "application/json",
  jsonc: "application/json",
  json5: "application/json",
  ndjson: "application/x-ndjson",
  yaml: "application/yaml",
  yml: "application/yaml",
  toml: "application/toml",
  xml: "application/xml",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  ini: "text/plain",
  cfg: "text/plain",
  conf: "text/plain",
  env: "text/plain",
  properties: "text/plain",
  sql: "application/sql",
  ics: "text/calendar",
  vcf: "text/vcard",
  db: "application/vnd.sqlite3",
  sqlite: "application/vnd.sqlite3",
  sqlite3: "application/vnd.sqlite3",
  ts: "text/typescript",
  tsx: "text/typescript",
  js: "text/javascript",
  jsx: "text/javascript",
  mjs: "text/javascript",
  cjs: "text/javascript",
  py: "text/x-python",
  rb: "text/x-ruby",
  go: "text/x-go",
  rs: "text/x-rust",
  java: "text/x-java",
  kt: "text/x-kotlin",
  swift: "text/x-swift",
  c: "text/x-c",
  h: "text/x-c",
  cc: "text/x-c++",
  cpp: "text/x-c++",
  hpp: "text/x-c++",
  cs: "text/x-csharp",
  php: "application/x-httpd-php",
  sh: "application/x-sh",
  bash: "application/x-sh",
  zsh: "application/x-sh",
  ps1: "application/x-powershell",
  lua: "text/x-lua",
  r: "text/x-r",
  pl: "text/x-perl",
  dart: "text/x-dart",
  vue: "text/x-vue",
  svelte: "text/x-svelte",
  graphql: "application/graphql",
  gql: "application/graphql",
  proto: "text/x-protobuf",
  diff: "text/x-diff",
  patch: "text/x-diff",
  html: "text/html",
  htm: "text/html",
  xhtml: "application/xhtml+xml",
  css: "text/css",
  scss: "text/x-scss",
  sass: "text/x-sass",
  less: "text/x-less",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/vnd.microsoft.icon",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
  psd: "image/vnd.adobe.photoshop",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
  aac: "audio/aac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  m4a: "audio/mp4",
  opus: "audio/opus",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  webm: "video/webm",
  avi: "video/x-msvideo",
  mpg: "video/mpeg",
  mpeg: "video/mpeg",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
  wasm: "application/wasm",
  exe: "application/vnd.microsoft.portable-executable",
  so: "application/x-sharedlib",
  dll: "application/x-msdownload",
  bin: "application/octet-stream",
  dat: "application/octet-stream",
  pem: "application/x-pem-file",
  crt: "application/x-x509-ca-cert",
  cer: "application/x-x509-ca-cert",
  asc: "application/pgp-signature",
  sig: "application/pgp-signature",
  gpg: "application/pgp-encrypted",
};

const ARCHIVE_CONTENT_TYPES: Readonly<Record<ArchiveFormat, string>> = {
  zip: "application/zip",
  tar: "application/x-tar",
  "tar.gz": "application/gzip",
  "tar.bz2": "application/x-bzip2",
  "tar.xz": "application/x-xz",
  "7z": "application/x-7z-compressed",
  rar: "application/vnd.rar",
};

export function contentTypeOf(name: string): string | null {
  const archive = detectArchiveFormat(name);
  if (archive !== null) return ARCHIVE_CONTENT_TYPES[archive];
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return null;
  return CONTENT_TYPES[name.slice(dot + 1).toLowerCase()] ?? null;
}

const RWX = ["---", "--x", "-w-", "-wx", "r--", "r-x", "rw-", "rwx"] as const;

function typeCharOf(st: Stats): string {
  if (st.isSymbolicLink()) return "l";
  if (st.isDirectory()) return "d";
  if (st.isBlockDevice()) return "b";
  if (st.isCharacterDevice()) return "c";
  if (st.isFIFO()) return "p";
  if (st.isSocket()) return "s";
  return "-";
}

export function formatModeOctal(mode: number): string {
  return (mode & 0o7777).toString(8).padStart(4, "0");
}

export function formatModeText(mode: number, typeChar = "-"): string {
  const chars = [(mode >> 6) & 0o7, (mode >> 3) & 0o7, mode & 0o7]
    .map((triple) => RWX[triple] ?? "---")
    .join("")
    .split("");
  const special = (mode >> 9) & 0o7;
  if (special & 0o4) chars[2] = chars[2] === "x" ? "s" : "S";
  if (special & 0o2) chars[5] = chars[5] === "x" ? "s" : "S";
  if (special & 0o1) chars[8] = chars[8] === "x" ? "t" : "T";
  return typeChar + chars.join("");
}

function ownerNameFor(uid: number): string | null {
  try {
    const self = userInfo();
    return self.uid === uid ? self.username : null;
  } catch {
    return null;
  }
}

export interface PathPropertiesOutput {
  name: string;
  path: string;
  parentPath: string | null;
  kind: EntryKind;
  targetKind: EntryKind | null;
  isSymlink: boolean;
  escapesRoot: boolean;
  linkTarget: string | null;
  linkTargetPath: string | null;
  sizeBytes: number;
  modifiedAtMs: number;
  createdAtMs: number | null;
  accessedAtMs: number;
  modeOctal: string;
  modeText: string;
  ownerUid: number;
  ownerGid: number;
  ownerName: string | null;
  linkCount: number;
  contentType: string | null;
}

function effectiveKind(
  kind: EntryKind,
  targetKind: EntryKind | null,
): EntryKind {
  return kind === "symlink" && targetKind !== null ? targetKind : kind;
}

export async function pathProperties(input: {
  path: string;
}): Promise<PathPropertiesOutput> {
  const abs = normalize(input.path);
  const root = getRoot();

  let target: string;
  let st: Stats;
  if (abs === root) {
    assertInside(abs);
    target = root;
    try {
      st = await lstat(root);
    } catch (error) {
      throw mapNodeError(error, root);
    }
  } else {
    const resolved = await resolveLink(input.path);
    target = resolved.path;
    st = resolved.lstat;
  }

  const entry = await entryFrom(target, st);

  let linkTarget: string | null = null;
  let linkTargetPath: string | null = null;
  if (entry.isSymlink) {
    linkTarget = await readlink(target).catch(() => null);
    const real = await realpath(target).catch(() => null);
    linkTargetPath = real !== null && isInside(real) ? real : null;
  }

  const kind = effectiveKind(entry.kind, entry.targetKind);

  return {
    name: entry.name,
    path: entry.path,
    parentPath: parentOf(entry.path),
    kind: entry.kind,
    targetKind: entry.targetKind,
    isSymlink: entry.isSymlink,
    escapesRoot: entry.escapesRoot,
    linkTarget,
    linkTargetPath,
    sizeBytes: st.size,
    modifiedAtMs: Math.floor(st.mtimeMs),
    createdAtMs: st.birthtimeMs > 0 ? Math.floor(st.birthtimeMs) : null,
    accessedAtMs: Math.floor(st.atimeMs),
    modeOctal: formatModeOctal(st.mode),
    modeText: formatModeText(st.mode, typeCharOf(st)),
    ownerUid: st.uid,
    ownerGid: st.gid,
    ownerName: ownerNameFor(st.uid),
    linkCount: st.nlink,
    contentType: kind === "directory" ? null : contentTypeOf(entry.name),
  };
}

export const DIRECTORY_SIZE_MAX_DEPTH = 32;
export const DIRECTORY_SIZE_MAX_ENTRIES = 200_000;
export const DIRECTORY_SIZE_TIME_BUDGET_MS = 5_000;

export type DirectorySizeStop = "depth" | "entries" | "time";

export interface DirectorySizeOutput {
  path: string;
  sizeBytes: number;
  fileCount: number;
  directoryCount: number;
  visitedEntries: number;
  partial: boolean;
  stoppedBy: DirectorySizeStop | null;
  elapsedMs: number;
}

export async function directorySize(input: {
  path: string;
}): Promise<DirectorySizeOutput> {
  const dirReal = await resolveExistingDir(input.path);
  const startedAt = Date.now();

  let sizeBytes = 0;
  let fileCount = 0;
  let directoryCount = 0;
  let visitedEntries = 0;
  let hardStop: "entries" | "time" | null = null;
  let depthLimited = false;

  const stack: { dir: string; depth: number }[] = [{ dir: dirReal, depth: 0 }];

  while (stack.length > 0 && hardStop === null) {
    const current = stack.pop();
    if (current === undefined) break;

    let children: Dirent[];
    try {
      children = await readdir(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const child of children) {
      if (Date.now() - startedAt > DIRECTORY_SIZE_TIME_BUDGET_MS) {
        hardStop = "time";
        break;
      }
      if (visitedEntries >= DIRECTORY_SIZE_MAX_ENTRIES) {
        hardStop = "entries";
        break;
      }

      const absolutePath = path.join(current.dir, child.name);
      if (isStagingPath(absolutePath)) continue;
      visitedEntries += 1;

      if (child.isSymbolicLink()) continue;

      if (child.isDirectory()) {
        directoryCount += 1;
        if (current.depth + 1 >= DIRECTORY_SIZE_MAX_DEPTH) {
          depthLimited = true;
          continue;
        }
        stack.push({ dir: absolutePath, depth: current.depth + 1 });
        continue;
      }

      if (!child.isFile()) continue;

      try {
        const st = await lstat(absolutePath);
        sizeBytes += st.size;
        fileCount += 1;
      } catch {}
    }
  }

  const stoppedBy: DirectorySizeStop | null =
    hardStop ?? (depthLimited ? "depth" : null);
  return {
    path: dirReal,
    sizeBytes,
    fileCount,
    directoryCount,
    visitedEntries,
    partial: stoppedBy !== null,
    stoppedBy,
    elapsedMs: Date.now() - startedAt,
  };
}
