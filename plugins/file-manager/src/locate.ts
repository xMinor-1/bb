import { realpath, stat } from "node:fs/promises";
import path from "node:path";

import type { BbPluginApi } from "@get-bb/plugin-sdk";

import type { ThreadWorkspaceReason } from "../contract";
import { fmError, isFileManagerError } from "./errors";
import {
  assertInside,
  getRoot,
  isInside,
  normalize,
  resolveExisting,
} from "./root";

export interface FileOpenerSource {
  kind: "host" | "thread-storage" | "workspace";
  threadId: string | null;
  environmentId: string | null;
  projectId: string | null;
}

export interface LocateFileInput {
  path: string;
  source: FileOpenerSource;
}

export interface LocateFileOutput {
  dirPath: string;
  absolutePath: string;
  name: string;
  exists: boolean;
  isDirectory: boolean;
  matchHint: string | null;
}

const GLOB_CHARACTERS = /[*?[\]]/u;

function globMatchHint(name: string): string | null {
  if (!GLOB_CHARACTERS.test(name)) return null;
  const literals = name
    .split(GLOB_CHARACTERS)
    .filter((part) => part.length > 0);
  if (literals.length === 0) return null;
  return literals.reduce(
    (longest, part) => (part.length > longest.length ? part : longest),
    "",
  );
}

async function environmentCheckoutPath(
  bb: BbPluginApi,
  environmentId: string,
): Promise<string | null> {
  const environment = await bb.sdk.environments.get({ environmentId });
  return environment.path === null || environment.path === ""
    ? null
    : environment.path;
}

async function toAbsolutePath(
  bb: BbPluginApi,
  input: LocateFileInput,
): Promise<string> {
  const { source } = input;

  if (source.kind === "workspace") {
    if (source.environmentId === null) {
      throw fmError("unsupported", "this workspace file has no environment");
    }
    const checkout = await environmentCheckoutPath(bb, source.environmentId);
    if (checkout === null) {
      throw fmError(
        "unsupported",
        "this environment has no checkout on disk yet",
      );
    }
    return path.resolve(checkout, input.path);
  }

  if (source.kind === "thread-storage") {
    if (source.threadId === null) {
      throw fmError("unsupported", "this stored file has no thread");
    }
    const storage = await bb.sdk.threads.storageLocation({
      threadId: source.threadId,
    });
    return path.resolve(storage.storageRootPath, input.path);
  }

  return input.path;
}

async function nearestExistingDir(startFrom: string): Promise<string> {
  const root = getRoot();
  let candidate = startFrom;
  while (isInside(candidate)) {
    try {
      const real = await resolveExisting(candidate);
      const stats = await stat(real);
      if (stats.isDirectory()) return real;
    } catch {}
    const parent = path.dirname(candidate);
    if (parent === candidate) break;
    candidate = parent;
  }
  return root;
}

export async function locateFile(
  bb: BbPluginApi,
  input: LocateFileInput,
): Promise<LocateFileOutput> {
  const absolute = normalize(await toAbsolutePath(bb, input));
  assertInside(absolute);

  const name = absolute === getRoot() ? "" : path.basename(absolute);

  try {
    const real = await resolveExisting(absolute);
    const stats = await stat(real);
    if (stats.isDirectory()) {
      return {
        dirPath: real,
        absolutePath: real,
        name: "",
        exists: true,
        isDirectory: true,
        matchHint: null,
      };
    }
    const parent = path.dirname(real);
    return {
      dirPath: parent,
      absolutePath: real,
      name: path.basename(real),
      exists: true,
      isDirectory: false,
      matchHint: null,
    };
  } catch (error) {
    if (isFileManagerError(error) && error.code === "path_escape") throw error;
  }

  return {
    dirPath: await nearestExistingDir(path.dirname(absolute)),
    absolutePath: absolute,
    name,
    exists: false,
    isDirectory: false,
    matchHint: globMatchHint(name),
  };
}

export interface ThreadWorkspaceInput {
  threadId: string;
}

export interface ThreadWorkspaceOutput {
  path: string | null;
  insideRoot: boolean;
  reason: ThreadWorkspaceReason | null;
}

export async function resolveThreadWorkspace(
  bb: BbPluginApi,
  input: ThreadWorkspaceInput,
): Promise<ThreadWorkspaceOutput> {
  const thread = await bb.sdk.threads.get({ threadId: input.threadId });
  if (thread.environmentId === null) {
    return { path: null, insideRoot: false, reason: "no_environment" };
  }

  const checkout = await environmentCheckoutPath(bb, thread.environmentId);
  if (checkout === null) {
    return { path: null, insideRoot: false, reason: "no_checkout" };
  }

  let real: string | null = null;
  try {
    const resolved = await realpath(normalize(checkout));
    if ((await stat(resolved)).isDirectory()) real = resolved;
  } catch {}
  if (real === null) {
    return { path: null, insideRoot: false, reason: "no_checkout" };
  }

  if (!isInside(real)) {
    return { path: real, insideRoot: false, reason: "outside_root" };
  }
  return { path: real, insideRoot: true, reason: null };
}
