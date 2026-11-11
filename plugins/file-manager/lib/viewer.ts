import type { FileEntry } from "../contract";
import { isImageName } from "./preview";

export type ViewerKind =
  | "image"
  | "pdf"
  | "video"
  | "audio"
  | "markdown"
  | "text"
  | "archive";

const VIDEO_EXTENSIONS: ReadonlySet<string> = new Set([
  "mp4",
  "m4v",
  "webm",
  "ogv",
  "mov",
]);

const AUDIO_EXTENSIONS: ReadonlySet<string> = new Set([
  "mp3",
  "wav",
  "ogg",
  "oga",
  "m4a",
  "aac",
  "flac",
  "opus",
  "weba",
]);

const MARKDOWN_EXTENSIONS: ReadonlySet<string> = new Set([
  "md",
  "markdown",
  "mdx",
]);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function viewerKindFor(name: string): ViewerKind {
  if (isImageName(name)) return "image";
  const extension = extensionOf(name);
  if (extension === "pdf") return "pdf";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (AUDIO_EXTENSIONS.has(extension)) return "audio";
  if (MARKDOWN_EXTENSIONS.has(extension)) return "markdown";
  return "text";
}

export function viewerKindForEntry(entry: FileEntry): ViewerKind {
  return entry.archiveFormat !== null ? "archive" : viewerKindFor(entry.name);
}

export function isTextViewerKind(kind: ViewerKind): boolean {
  return kind === "text" || kind === "markdown";
}

export function isUrlViewerKind(kind: ViewerKind): boolean {
  return (
    kind === "image" || kind === "pdf" || kind === "video" || kind === "audio"
  );
}

export function isViewableEntry(entry: FileEntry): boolean {
  if (entry.escapesRoot) return false;
  const kind =
    entry.isSymlink && entry.targetKind !== null
      ? entry.targetKind
      : entry.kind;
  return kind === "file";
}
