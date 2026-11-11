import type { FileEntry } from "../contract";

const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "bmp",
  "svg",
]);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function isImageName(name: string): boolean {
  return IMAGE_EXTENSIONS.has(extensionOf(name));
}

export function isImageEntry(entry: FileEntry): boolean {
  if (entry.escapesRoot) return false;
  const kind =
    entry.isSymlink && entry.targetKind !== null
      ? entry.targetKind
      : entry.kind;
  if (kind !== "file") return false;
  return isImageName(entry.name);
}

export function previewUrl(baseUrl: string, relativePath: string): string {
  const encoded = relativePath
    .split("/")
    .filter((segment) => segment !== "")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  if (encoded === "") return baseUrl;
  return baseUrl.endsWith("/")
    ? `${baseUrl}${encoded}`
    : `${baseUrl}/${encoded}`;
}
