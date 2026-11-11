import { defineMessages, messagesNow } from "./i18n";

export const SEPARATOR = "/";

const messages = defineMessages(
  { homeFolder: "the home folder" },
  { homeFolder: "домашней папки" },
);

let clientRoot = SEPARATOR;

export function setClientRoot(root: string): void {
  clientRoot = root;
}

export function getClientRoot(): string {
  return clientRoot;
}

export function isAbsolutePath(path: string): boolean {
  return path.startsWith(SEPARATOR);
}

export function rootPhrase(root: string = getClientRoot()): string {
  const normalized = normalizePath(root);
  if (normalized === "" || normalized === SEPARATOR)
    return messagesNow(messages).homeFolder;
  return normalized;
}

export function normalizePath(path: string): string {
  const absolute = isAbsolutePath(path);
  const out: string[] = [];
  for (const segment of path.split(SEPARATOR)) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      const last = out[out.length - 1];
      if (out.length > 0 && last !== "..") out.pop();
      else if (!absolute) out.push("..");
      continue;
    }
    out.push(segment);
  }
  const joined = out.join(SEPARATOR);
  if (absolute) return SEPARATOR + joined;
  return joined;
}

export function toAbsolute(
  input: string,
  root: string = getClientRoot(),
): string {
  const rootPath = normalizePath(root);
  const trimmed = input.trim();
  if (trimmed === "" || trimmed === "~") return rootPath;
  if (trimmed === "~/") return rootPath;
  if (trimmed.startsWith("~/"))
    return normalizePath(`${rootPath}/${trimmed.slice(2)}`);
  if (isAbsolutePath(trimmed)) return normalizePath(trimmed);
  return normalizePath(`${rootPath}/${trimmed}`);
}

export function toRelative(
  absolute: string,
  root: string = getClientRoot(),
): string {
  const rootPath = normalizePath(root);
  const path = normalizePath(absolute);
  if (path === rootPath) return "";
  if (!path.startsWith(`${rootPath}${SEPARATOR}`)) return "";
  return path.slice(rootPath.length + 1);
}

export function isRootPath(
  path: string,
  root: string = getClientRoot(),
): boolean {
  return normalizePath(path) === normalizePath(root);
}

export function isInsideRoot(
  path: string,
  root: string = getClientRoot(),
): boolean {
  const rootPath = normalizePath(root);
  const candidate = normalizePath(path);
  return (
    candidate === rootPath || candidate.startsWith(`${rootPath}${SEPARATOR}`)
  );
}

export function decodeSubPath(subPath: string): string {
  if (subPath === "") return "";
  return subPath
    .split(SEPARATOR)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join(SEPARATOR);
}

export function encodeSubPath(relative: string): string {
  if (relative === "") return "";
  return relative.split(SEPARATOR).map(encodeURIComponent).join(SEPARATOR);
}

export function subPathToAbsolute(
  subPath: string,
  root: string = getClientRoot(),
): string {
  return toAbsolute(decodeSubPath(subPath), root);
}

export function absoluteToSubPath(
  absolute: string,
  root: string = getClientRoot(),
): string {
  return toRelative(absolute, root);
}

export function joinPath(base: string, ...segments: string[]): string {
  const tail = segments.filter((segment) => segment !== "").join(SEPARATOR);
  if (tail === "") return normalizePath(base);
  return normalizePath(`${base}${SEPARATOR}${tail}`);
}

export function basename(path: string): string {
  const normalized = normalizePath(path);
  if (normalized === SEPARATOR) return SEPARATOR;
  const index = normalized.lastIndexOf(SEPARATOR);
  return index === -1 ? normalized : normalized.slice(index + 1);
}

export function dirname(path: string): string {
  const normalized = normalizePath(path);
  if (normalized === SEPARATOR) return SEPARATOR;
  const index = normalized.lastIndexOf(SEPARATOR);
  if (index <= 0) return index === 0 ? SEPARATOR : ".";
  return normalized.slice(0, index);
}

export function parentPath(
  path: string,
  root: string = getClientRoot(),
): string | null {
  const normalized = normalizePath(path);
  if (!isInsideRoot(normalized, root) || isRootPath(normalized, root))
    return null;
  return dirname(normalized);
}

export function isSamePath(a: string, b: string): boolean {
  return normalizePath(a) === normalizePath(b);
}

export function isDescendant(candidate: string, ancestor: string): boolean {
  const child = normalizePath(candidate);
  const parent = normalizePath(ancestor);
  if (child === parent) return false;
  const prefix = parent === SEPARATOR ? SEPARATOR : `${parent}${SEPARATOR}`;
  return child.startsWith(prefix);
}

export function isSameOrDescendant(
  candidate: string,
  ancestor: string,
): boolean {
  return isSamePath(candidate, ancestor) || isDescendant(candidate, ancestor);
}

export interface Breadcrumb {
  name: string;
  path: string;
  isRoot: boolean;
}

export function breadcrumbs(
  absolute: string,
  root: string = getClientRoot(),
  rootLabel = "Home",
): Breadcrumb[] {
  const rootPath = normalizePath(root);
  const crumbs: Breadcrumb[] = [
    { name: rootLabel, path: rootPath, isRoot: true },
  ];
  const relative = toRelative(absolute, rootPath);
  if (relative === "") return crumbs;
  let current = rootPath;
  for (const segment of relative.split(SEPARATOR)) {
    if (segment === "") continue;
    current = `${current}${SEPARATOR}${segment}`;
    crumbs.push({ name: segment, path: current, isRoot: false });
  }
  return crumbs;
}

export interface SplitName {
  stem: string;
  extension: string;
}

export function splitFileName(name: string): SplitName {
  const doubleSuffix = /\.tar\.(gz|bz2|xz)$/iu.exec(name);
  if (doubleSuffix !== null && doubleSuffix.index > 0) {
    return {
      stem: name.slice(0, doubleSuffix.index),
      extension: name.slice(doubleSuffix.index),
    };
  }
  const index = name.lastIndexOf(".");
  if (index <= 0) return { stem: name, extension: "" };
  return { stem: name.slice(0, index), extension: name.slice(index) };
}

export function isHiddenName(name: string): boolean {
  return name.startsWith(".");
}

export function relativeDirOf(relativePath: string): string {
  const normalized = normalizePath(relativePath.replace(/^\/+/u, ""));
  const index = normalized.lastIndexOf(SEPARATOR);
  return index === -1 ? "" : normalized.slice(0, index);
}
