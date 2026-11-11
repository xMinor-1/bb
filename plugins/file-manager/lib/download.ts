import { DOWNLOAD_URL, DOWNLOAD_ZIP_URL, type FileEntry } from "../contract";
import { basename, dirname } from "./fm-paths";

export type DownloadDisposition = "attachment" | "inline";

export function buildDownloadUrl(
  path: string,
  disposition: DownloadDisposition = "attachment",
): string {
  const query = new URLSearchParams({ path });
  if (disposition !== "attachment") query.set("disposition", disposition);
  return `${DOWNLOAD_URL}?${query.toString()}`;
}

export interface DownloadOptions {
  disposition?: DownloadDisposition;
  fileName?: string;
  document?: Document;
}

export function downloadPath(
  path: string,
  options: DownloadOptions = {},
): string {
  const url = buildDownloadUrl(path, options.disposition ?? "attachment");
  const doc =
    options.document ??
    (typeof document === "undefined" ? undefined : document);
  if (doc === undefined) return url;

  const anchor = doc.createElement("a");
  anchor.href = url;
  anchor.download = options.fileName ?? basename(path);
  anchor.rel = "noopener";
  anchor.style.display = "none";
  doc.body.append(anchor);
  anchor.click();
  anchor.remove();
  return url;
}

export function downloadEntry(
  entry: FileEntry,
  options: DownloadOptions = {},
): string | null {
  if (entry.escapesRoot) return null;
  const kind = entry.isSymlink ? entry.targetKind : entry.kind;
  if (kind !== "file") return null;
  return downloadPath(entry.path, { fileName: entry.name, ...options });
}

export const MAX_ZIP_URL_LENGTH = 8000;

export function commonParent(paths: readonly string[]): string {
  let common = dirname(paths[0] ?? "/");
  for (const path of paths.slice(1)) {
    while (common !== "/" && !path.startsWith(`${common}/`))
      common = dirname(common);
  }
  return common;
}

export function buildZipDownloadUrl(paths: readonly string[]): string {
  const dir = commonParent(paths);
  const query = new URLSearchParams({ dir });
  const prefix = dir === "/" ? "/" : `${dir}/`;
  for (const path of paths) query.append("name", path.slice(prefix.length));
  return `${DOWNLOAD_ZIP_URL}?${query.toString()}`;
}

export function downloadZip(
  paths: readonly string[],
  options: Pick<DownloadOptions, "document"> = {},
): string | null {
  const url = buildZipDownloadUrl(paths);
  if (url.length > MAX_ZIP_URL_LENGTH) return null;
  const doc =
    options.document ??
    (typeof document === "undefined" ? undefined : document);
  if (doc === undefined) return url;
  const anchor = doc.createElement("a");
  anchor.href = url;
  anchor.download = "";
  anchor.rel = "noopener";
  anchor.style.display = "none";
  doc.body.append(anchor);
  anchor.click();
  anchor.remove();
  return url;
}
