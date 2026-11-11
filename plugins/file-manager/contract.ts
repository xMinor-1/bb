import type { PluginRpcContract } from "@get-bb/plugin-sdk";

const defineRpcContract = <const Contract extends PluginRpcContract>(
  contract: Contract,
): Contract => contract;
import { z } from "zod";

export const PLUGIN_ID = "file-manager";
export const PANEL_PATH = "files";
export const RPC_BASE = `/api/v1/plugins/${PLUGIN_ID}/rpc`;
export const HTTP_BASE = `/api/v1/plugins/${PLUGIN_ID}/http`;
export const TOKEN_URL = `/api/v1/plugins/${PLUGIN_ID}/token`;
export const UPLOAD_CHUNK_URL = `${HTTP_BASE}/upload/chunk`;
export const DOWNLOAD_URL = `${HTTP_BASE}/download`;
export const DOWNLOAD_ZIP_URL = `${HTTP_BASE}/download-zip`;

export const LOCATION_OPENER_EXTENSIONS = [
  "md",
  "mdx",
  "markdown",
  "txt",
  "rst",
  "adoc",
  "org",
  "tex",
  "epub",
  "pages",
  "numbers",
  "key",
  "json",
  "jsonc",
  "json5",
  "yaml",
  "yml",
  "toml",
  "ini",
  "cfg",
  "conf",
  "env",
  "csv",
  "tsv",
  "xml",
  "sql",
  "log",
  "lock",
  "properties",
  "plist",
  "db",
  "sqlite",
  "sqlite3",
  "parquet",
  "ndjson",
  "har",
  "ics",
  "vcf",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "pyi",
  "ipynb",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "kts",
  "swift",
  "m",
  "mm",
  "c",
  "h",
  "cc",
  "cpp",
  "hpp",
  "cs",
  "php",
  "sh",
  "bash",
  "zsh",
  "fish",
  "ps1",
  "bat",
  "cmd",
  "lua",
  "r",
  "pl",
  "scala",
  "clj",
  "cljs",
  "ex",
  "exs",
  "erl",
  "hs",
  "ml",
  "dart",
  "vue",
  "svelte",
  "astro",
  "graphql",
  "gql",
  "proto",
  "diff",
  "patch",
  "gradle",
  "cmake",
  "mk",
  "asm",
  "vb",
  "f90",
  "jl",
  "nim",
  "zig",
  "sol",
  "tf",
  "tfvars",
  "hcl",
  "nix",
  "bzl",
  "html",
  "htm",
  "xhtml",
  "css",
  "scss",
  "sass",
  "less",
  "styl",
  "map",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "avif",
  "bmp",
  "ico",
  "tif",
  "tiff",
  "heic",
  "psd",
  "ai",
  "eps",
  "mp3",
  "wav",
  "flac",
  "aac",
  "ogg",
  "oga",
  "m4a",
  "opus",
  "aiff",
  "mp4",
  "m4v",
  "mov",
  "mkv",
  "webm",
  "avi",
  "wmv",
  "flv",
  "mpg",
  "mpeg",
  "zip",
  "tar",
  "gz",
  "tgz",
  "bz2",
  "tbz",
  "tbz2",
  "xz",
  "txz",
  "7z",
  "rar",
  "zst",
  "lz4",
  "iso",
  "dmg",
  "jar",
  "war",
  "whl",
  "gem",
  "crate",
  "nupkg",
  "xpi",
  "vsix",
  "apk",
  "aab",
  "ipa",
  "deb",
  "rpm",
  "pkg",
  "msi",
  "appimage",
  "snap",
  "flatpak",
  "cab",
  "ttf",
  "otf",
  "woff",
  "woff2",
  "eot",
  "exe",
  "dll",
  "so",
  "dylib",
  "bin",
  "dat",
  "img",
  "wasm",
  "o",
  "a",
  "class",
  "pyc",
  "node",
  "pem",
  "crt",
  "cer",
  "der",
  "p12",
  "pfx",
  "asc",
  "sig",
  "gpg",
] as const;

export const FS_CHANNEL = "fs";
export const JOB_CHANNEL = "job";

export const MAX_LIST_ENTRIES = 5000;
export const MAX_SEARCH_RESULTS = 500;
export const MAX_SEARCH_DEPTH = 8;
export const STAGING_DIR_NAME = ".bb-file-manager";

export const UPLOAD_ID_PATTERN = /^[0-9a-f]{32}$/u;
export const MIN_CHUNK_BYTES = 4 * 1024 * 1024;
export const MAX_CHUNK_BYTES = 64 * 1024 * 1024;

export const MENTION_PROVIDER_ID = "file";
export const MENTION_PROVIDER_LABEL = "Files";

export const entryKindSchema = z.enum([
  "file",
  "directory",
  "symlink",
  "other",
]);
export type EntryKind = z.infer<typeof entryKindSchema>;

export const archiveFormatSchema = z.enum([
  "zip",
  "tar",
  "tar.gz",
  "tar.bz2",
  "tar.xz",
  "7z",
  "rar",
]);
export type ArchiveFormat = z.infer<typeof archiveFormatSchema>;

const ARCHIVE_SUFFIXES: ReadonlyArray<readonly [string, ArchiveFormat]> = [
  [".tar.gz", "tar.gz"],
  [".tar.bz2", "tar.bz2"],
  [".tar.xz", "tar.xz"],
  [".tgz", "tar.gz"],
  [".tbz2", "tar.bz2"],
  [".tbz", "tar.bz2"],
  [".txz", "tar.xz"],
  [".zip", "zip"],
  [".tar", "tar"],
  [".7z", "7z"],
  [".rar", "rar"],
];

export function detectArchiveFormat(name: string): ArchiveFormat | null {
  const lower = name.toLowerCase();
  for (const [suffix, format] of ARCHIVE_SUFFIXES) {
    if (lower.length > suffix.length && lower.endsWith(suffix)) return format;
  }
  return null;
}

export const sortFieldSchema = z.enum(["name", "size", "modified", "kind"]);
export const sortDirectionSchema = z.enum(["asc", "desc"]);
export const conflictPolicySchema = z.enum(["rename", "overwrite", "fail"]);

export const viewModeSchema = z.enum(["list", "gallery"]);
export type ViewMode = z.infer<typeof viewModeSchema>;

export const PREVIEW_TTL_MS = 10 * 60 * 1000;

export const MAX_TEXT_PREVIEW_BYTES = 1024 * 1024;

export const MAX_ARCHIVE_ENTRIES = 10_000;

export const errorCodeSchema = z.enum([
  "invalid_path",
  "invalid_name",
  "path_escape",
  "not_found",
  "not_a_directory",
  "not_a_file",
  "exists",
  "not_empty",
  "permission_denied",
  "cross_device",
  "destination_inside_source",
  "unsupported_archive",
  "archive_failed",
  "upload_not_found",
  "upload_busy",
  "offset_mismatch",
  "size_mismatch",
  "no_space",
  "io_error",
  "unsupported",
]);
export type FileManagerErrorCode = z.infer<typeof errorCodeSchema>;

export const fileOpenerSourceSchema = z.strictObject({
  kind: z.enum(["host", "thread-storage", "workspace"]),
  threadId: z.string().nullable(),
  environmentId: z.string().nullable(),
  projectId: z.string().nullable(),
});
export type FileOpenerSourceInput = z.infer<typeof fileOpenerSourceSchema>;

export const threadWorkspaceReasonSchema = z.enum([
  "no_environment",
  "no_checkout",
  "outside_root",
]);
export type ThreadWorkspaceReason = z.infer<typeof threadWorkspaceReasonSchema>;

export const entrySchema = z.strictObject({
  name: z.string(),
  path: z.string(),
  kind: entryKindSchema,
  targetKind: entryKindSchema.nullable(),
  sizeBytes: z.number(),
  modifiedAtMs: z.number(),
  isHidden: z.boolean(),
  isSymlink: z.boolean(),
  escapesRoot: z.boolean(),
  archiveFormat: archiveFormatSchema.nullable(),
});
export type FileEntry = z.infer<typeof entrySchema>;

export const preferencesSchema = z.strictObject({
  showHiddenFiles: z.boolean(),
  confirmOnDelete: z.boolean(),
  restoreLastFolder: z.boolean(),
  openThreadWorkspace: z.boolean(),
  sortField: sortFieldSchema,
  sortDirection: sortDirectionSchema,
  viewMode: viewModeSchema,
});
export type Preferences = z.infer<typeof preferencesSchema>;

export const volumeSchema = z.strictObject({
  totalBytes: z.number(),
  freeBytes: z.number(),
});

export const batchResultSchema = z.strictObject({
  succeeded: z.array(z.string()),
  failed: z.array(
    z.strictObject({
      path: z.string(),
      code: errorCodeSchema,
      message: z.string(),
    }),
  ),
});

export const jobSchema = z.strictObject({
  jobId: z.string(),
  kind: z.literal("extract"),
  state: z.enum(["running", "done", "failed", "canceled"]),
  label: z.string(),
  subject: z.string(),
  startedAtMs: z.number(),
  finishedAtMs: z.number().nullable(),
  processedBytes: z.number(),
  totalBytes: z.number(),
  resultPath: z.string().nullable(),
  errorCode: errorCodeSchema.nullable(),
  errorMessage: z.string().nullable(),
});
export type Job = z.infer<typeof jobSchema>;

export const fsSignalSchema = z.strictObject({
  paths: z.array(z.string()),
  reason: z.enum([
    "create",
    "delete",
    "rename",
    "move",
    "copy",
    "upload",
    "extract",
  ]),
});
export type FsSignal = z.infer<typeof fsSignalSchema>;

export const pathPropertiesSchema = z.strictObject({
  name: z.string(),
  path: z.string(),
  parentPath: z.string().nullable(),
  kind: entryKindSchema,
  targetKind: entryKindSchema.nullable(),
  isSymlink: z.boolean(),
  escapesRoot: z.boolean(),
  linkTarget: z.string().nullable(),
  linkTargetPath: z.string().nullable(),
  sizeBytes: z.number(),
  modifiedAtMs: z.number(),
  createdAtMs: z.number().nullable(),
  accessedAtMs: z.number(),
  modeOctal: z.string(),
  modeText: z.string(),
  ownerUid: z.number(),
  ownerGid: z.number(),
  ownerName: z.string().nullable(),
  linkCount: z.number(),
  contentType: z.string().nullable(),
});
export type PathProperties = z.infer<typeof pathPropertiesSchema>;

export const directorySizeSchema = z.strictObject({
  path: z.string(),
  sizeBytes: z.number(),
  fileCount: z.number().int(),
  directoryCount: z.number().int(),
  visitedEntries: z.number().int(),
  partial: z.boolean(),
  stoppedBy: z.enum(["depth", "entries", "time"]).nullable(),
  elapsedMs: z.number(),
});
export type DirectorySize = z.infer<typeof directorySizeSchema>;

export const archiveEntryKindSchema = z.enum([
  "file",
  "directory",
  "symlink",
  "hardlink",
  "other",
]);
export type ArchiveEntryKind = z.infer<typeof archiveEntryKindSchema>;

export const archiveEntrySchema = z.strictObject({
  path: z.string(),
  kind: archiveEntryKindSchema,
  sizeBytes: z.number(),
  modifiedAtMs: z.number().nullable(),
  encrypted: z.boolean(),
  linkTarget: z.string().nullable(),
});
export type ArchiveEntry = z.infer<typeof archiveEntrySchema>;

export const archiveStopReasonSchema = z.enum([
  "entries",
  "time",
  "output",
  "damaged",
]);
export type ArchiveStopReason = z.infer<typeof archiveStopReasonSchema>;

export const archiveListingSchema = z.strictObject({
  path: z.string(),
  format: archiveFormatSchema,
  archiveSizeBytes: z.number(),
  entries: z.array(archiveEntrySchema),
  totalEntries: z.number().int(),
  fileCount: z.number().int(),
  directoryCount: z.number().int(),
  uncompressedBytes: z.number(),
  encryptedCount: z.number().int(),
  truncated: z.boolean(),
  partial: z.boolean(),
  stoppedBy: archiveStopReasonSchema.nullable(),
  problem: z.string().nullable(),
  extractable: z.boolean(),
});
export type ArchiveListing = z.infer<typeof archiveListingSchema>;

export const MAX_BOOKMARKS = 50;
export const MAX_BOOKMARK_NAME_LENGTH = 80;

export const bookmarkSchema = z.strictObject({
  path: z.string(),
  name: z.string(),
  order: z.number().int(),
  available: z.boolean(),
});
export type Bookmark = z.infer<typeof bookmarkSchema>;

export const fileManagerContract = defineRpcContract({
  getState: {
    input: z.null(),
    output: z.strictObject({
      root: z.string(),
      startFolder: z.string(),
      preferences: preferencesSchema,
      chunkSizeBytes: z.number().int(),
      maxListEntries: z.number().int(),
      archiveSupport: z.strictObject({
        zip: z.boolean(),
        tar: z.boolean(),
        sevenZip: z.boolean(),
        rar: z.boolean(),
      }),
      pluginVersion: z.string(),
      primaryHostId: z.string().nullable(),
    }),
  },

  listDir: {
    input: z.strictObject({
      path: z.string(),
      showHidden: z.boolean().default(false),
    }),
    output: z.strictObject({
      path: z.string(),
      parentPath: z.string().nullable(),
      isRoot: z.boolean(),
      entries: z.array(entrySchema),
      truncated: z.boolean(),
      totalEntries: z.number().int(),
      hiddenCount: z.number().int(),
      writable: z.boolean(),
      volume: volumeSchema.nullable(),
    }),
  },

  pathProperties: {
    input: z.strictObject({ path: z.string() }),
    output: pathPropertiesSchema,
  },

  directorySize: {
    input: z.strictObject({ path: z.string() }),
    output: directorySizeSchema,
  },

  statPath: {
    input: z.strictObject({ path: z.string() }),
    output: z.strictObject({
      entry: entrySchema,
      parentPath: z.string().nullable(),
    }),
  },

  createPreviewUrl: {
    input: z.strictObject({
      path: z.string(),
    }),
    output: z.strictObject({
      baseUrl: z.string(),
      path: z.string(),
      expiresAtMs: z.number().int(),
    }),
  },

  readTextFile: {
    input: z.strictObject({
      path: z.string(),
    }),
    output: z.strictObject({
      path: z.string(),
      text: z.string(),
      sizeBytes: z.number().int(),
      readBytes: z.number().int(),
      truncated: z.boolean(),
    }),
  },

  listArchive: {
    input: z.strictObject({
      path: z.string(),
    }),
    output: archiveListingSchema,
  },

  resolveFileLocation: {
    input: z.strictObject({
      path: z.string(),
      source: fileOpenerSourceSchema,
    }),
    output: z.strictObject({
      dirPath: z.string(),
      absolutePath: z.string(),
      name: z.string(),
      exists: z.boolean(),
      isDirectory: z.boolean(),
      matchHint: z.string().nullable(),
    }),
  },

  threadWorkspace: {
    input: z.strictObject({ threadId: z.string().min(1) }),
    output: z.strictObject({
      path: z.string().nullable(),
      insideRoot: z.boolean(),
      reason: threadWorkspaceReasonSchema.nullable(),
    }),
  },

  searchDir: {
    input: z.strictObject({
      path: z.string(),
      query: z.string().min(1),
      showHidden: z.boolean().default(false),
      maxDepth: z.number().int().min(1).max(MAX_SEARCH_DEPTH).default(4),
    }),
    output: z.strictObject({
      entries: z.array(entrySchema),
      truncated: z.boolean(),
    }),
  },

  createFolder: {
    input: z.strictObject({
      path: z.string(),
      name: z.string().min(1),
    }),
    output: z.strictObject({ entry: entrySchema }),
  },

  renameEntry: {
    input: z.strictObject({
      path: z.string(),
      newName: z.string().min(1),
    }),
    output: z.strictObject({ entry: entrySchema }),
  },

  deleteEntries: {
    input: z.strictObject({
      paths: z.array(z.string()).min(1).max(1000),
      recursive: z.boolean().default(true),
    }),
    output: batchResultSchema,
  },

  moveEntries: {
    input: z.strictObject({
      paths: z.array(z.string()).min(1).max(1000),
      destinationDir: z.string(),
      conflict: conflictPolicySchema.default("fail"),
    }),
    output: batchResultSchema,
  },

  copyEntries: {
    input: z.strictObject({
      paths: z.array(z.string()).min(1).max(1000),
      destinationDir: z.string(),
      conflict: conflictPolicySchema.default("rename"),
    }),
    output: batchResultSchema,
  },

  extractArchive: {
    input: z.strictObject({
      archivePath: z.string(),
      destinationDir: z.string().nullable().default(null),
      createSubfolder: z.boolean().default(true),
      conflict: conflictPolicySchema.default("rename"),
    }),
    output: z.strictObject({ job: jobSchema }),
  },

  jobStatus: {
    input: z.strictObject({ jobId: z.string() }),
    output: z.strictObject({ job: jobSchema.nullable() }),
  },

  jobCancel: {
    input: z.strictObject({ jobId: z.string() }),
    output: z.strictObject({ job: jobSchema.nullable() }),
  },

  uploadCreate: {
    input: z.strictObject({
      dirPath: z.string(),
      fileName: z.string().min(1),
      sizeBytes: z.number().int().min(0),
      lastModifiedMs: z.number().int().min(0).default(0),
      relativeDir: z.string().default(""),
    }),
    output: z.strictObject({
      uploadId: z.string(),
      receivedBytes: z.number().int(),
      chunkSizeBytes: z.number().int(),
      resumed: z.boolean(),
    }),
  },

  uploadStatus: {
    input: z.strictObject({ uploadId: z.string() }),
    output: z.strictObject({
      uploadId: z.string(),
      receivedBytes: z.number().int(),
      sizeBytes: z.number().int(),
      dirPath: z.string(),
      fileName: z.string(),
    }),
  },

  uploadFinish: {
    input: z.strictObject({
      uploadId: z.string(),
      conflict: conflictPolicySchema.default("rename"),
    }),
    output: z.strictObject({ entry: entrySchema }),
  },

  uploadAbort: {
    input: z.strictObject({ uploadId: z.string() }),
    output: z.strictObject({ ok: z.literal(true) }),
  },

  savePreferences: {
    input: z.strictObject({
      startFolder: z.string().optional(),
      openThreadWorkspace: z.boolean().optional(),
      showHiddenFiles: z.boolean().optional(),
      confirmOnDelete: z.boolean().optional(),
      sortField: sortFieldSchema.optional(),
      sortDirection: sortDirectionSchema.optional(),
      viewMode: viewModeSchema.optional(),
      uploadChunkMiB: z.enum(["4", "8", "16", "32", "64"]).optional(),
    }),
    output: z.strictObject({
      startFolder: z.string(),
      preferences: preferencesSchema,
      chunkSizeBytes: z.number().int(),
    }),
  },

  listBookmarks: {
    input: z.null(),
    output: z.strictObject({ bookmarks: z.array(bookmarkSchema) }),
  },

  addBookmark: {
    input: z.strictObject({
      path: z.string(),
      name: z.string().nullable().default(null),
    }),
    output: z.strictObject({ bookmarks: z.array(bookmarkSchema) }),
  },

  removeBookmark: {
    input: z.strictObject({ path: z.string() }),
    output: z.strictObject({ bookmarks: z.array(bookmarkSchema) }),
  },

  renameBookmark: {
    input: z.strictObject({ path: z.string(), name: z.string() }),
    output: z.strictObject({ bookmarks: z.array(bookmarkSchema) }),
  },
});

export type FileManagerContract = typeof fileManagerContract;
