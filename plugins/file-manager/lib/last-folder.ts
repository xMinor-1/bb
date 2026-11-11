import { createSessionStore } from "./fm-store";
import {
  isInsideRoot,
  isSamePath,
  normalizePath,
  subPathToAbsolute,
} from "./fm-paths";

export const LAST_FOLDER_STORAGE_KEY = "bb-plugin-file-manager:last-folder:v1";
export const LAST_FOLDER_MAX_BYTES = 8 * 1024;
export const LAST_FOLDER_DEBOUNCE_MS = 250;

export interface RememberedFolder {
  path: string;
  root: string;
}

function parseRemembered(raw: unknown): RememberedFolder | null {
  if (typeof raw !== "object" || raw === null) return null;
  const candidate = raw as Record<string, unknown>;
  const path = candidate.path;
  const root = candidate.root;
  if (typeof path !== "string" || path === "") return null;
  if (typeof root !== "string" || root === "") return null;
  return { path, root };
}

const store = createSessionStore<RememberedFolder | null>({
  key: LAST_FOLDER_STORAGE_KEY,
  fallback: () => null,
  parse: parseRemembered,
  maxBytes: LAST_FOLDER_MAX_BYTES,
});

export function readLastFolder(): RememberedFolder | null {
  return store.read();
}

export function rememberLastFolder(value: RememberedFolder): void {
  store.remember(value);
}

export function writeLastFolder(value: RememberedFolder): void {
  store.write(value);
}

export function forgetLastFolder(): void {
  store.clear();
}

export function resetLastFolderStore(): void {
  store.reset();
}

export type InitialFolderSource =
  | "deep-link"
  | "workspace"
  | "memory"
  | "start-folder";

export interface InitialFolderChoice {
  path: string;
  source: InitialFolderSource;
}

export interface PickInitialFolderArgs {
  subPath: string;
  remembered: RememberedFolder | null;
  workspaceFolder: string | null;
  startFolder: string;
  root: string;
  restoreLastFolder: boolean;
}

export function pickInitialFolder(
  args: PickInitialFolderArgs,
): InitialFolderChoice {
  const {
    subPath,
    remembered,
    workspaceFolder,
    startFolder,
    root,
    restoreLastFolder,
  } = args;

  if (subPath !== "") {
    return { path: subPathToAbsolute(subPath, root), source: "deep-link" };
  }
  if (workspaceFolder !== null && isInsideRoot(workspaceFolder, root)) {
    return { path: normalizePath(workspaceFolder), source: "workspace" };
  }
  const fallback: InitialFolderChoice = {
    path: startFolder,
    source: "start-folder",
  };
  if (!restoreLastFolder) return fallback;
  if (remembered === null) return fallback;
  if (!isSamePath(remembered.root, root)) return fallback;
  if (!isInsideRoot(remembered.path, root)) return fallback;
  return { path: normalizePath(remembered.path), source: "memory" };
}
