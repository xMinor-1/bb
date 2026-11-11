import { lstat, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { Stats } from "node:fs";

import { STAGING_DIR_NAME } from "../contract";
import { fmError, mapNodeError } from "./errors";

export const DEFAULT_ROOT = homedir();

let root: string = DEFAULT_ROOT;

export async function initRoot(input: string = DEFAULT_ROOT): Promise<string> {
  root = await realpath(input);
  return root;
}

export function getRoot(): string {
  return root;
}

export function getStagingDir(): string {
  return path.join(root, STAGING_DIR_NAME);
}

export function getUploadsDir(): string {
  return path.join(getStagingDir(), "uploads");
}

export function isStagingPath(candidate: string): boolean {
  const staging = getStagingDir();
  return candidate === staging || candidate.startsWith(staging + path.sep);
}

export function assertInside(candidate: string): string {
  if (candidate === root) return candidate;
  if (candidate.startsWith(root + path.sep)) return candidate;
  throw fmError("path_escape", candidate);
}

export function isInside(candidate: string): boolean {
  return candidate === root || candidate.startsWith(root + path.sep);
}

export function validateName(name: string): string {
  if (name === "" || name === "." || name === "..") {
    throw fmError("invalid_name", name === "" ? "(empty)" : name);
  }
  if (name.includes("/") || name.includes("\0"))
    throw fmError("invalid_name", name);
  // eslint-disable-next-line no-control-regex -- deliberate: reject control chars
  if (/[\x00-\x1f]/u.test(name)) throw fmError("invalid_name", name);
  if (Buffer.byteLength(name, "utf8") > 255)
    throw fmError("invalid_name", `${name.slice(0, 32)}…`);
  return name;
}

export function normalize(input: string): string {
  if (input === "" || input === "~") return root;
  const expanded = input.startsWith("~/") ? root + input.slice(1) : input;
  return path.resolve(root, expanded);
}

export async function resolveExisting(input: string): Promise<string> {
  const abs = normalize(input);
  assertInside(abs);
  let real: string;
  try {
    real = await realpath(abs);
  } catch (error) {
    throw mapNodeError(error, abs);
  }
  assertInside(real);
  return real;
}

export async function resolveExistingDir(input: string): Promise<string> {
  const real = await resolveExisting(input);
  let st: Stats;
  try {
    st = await stat(real);
  } catch (error) {
    throw mapNodeError(error, real);
  }
  if (!st.isDirectory()) throw fmError("not_a_directory", real);
  return real;
}

export interface ResolvedLink {
  path: string;
  lstat: Stats;
}

export async function resolveLink(input: string): Promise<ResolvedLink> {
  const abs = normalize(input);
  assertInside(abs);
  if (abs === root) throw fmError("path_escape", root);
  const parentReal = await resolveExisting(path.dirname(abs));
  const target = path.join(parentReal, validateName(path.basename(abs)));
  assertInside(target);
  if (target === root) throw fmError("path_escape", root);
  let st: Stats;
  try {
    st = await lstat(target);
  } catch (error) {
    throw mapNodeError(error, target);
  }
  return { path: target, lstat: st };
}

export async function resolveNew(
  dirInput: string,
  name: string,
): Promise<string> {
  const dirReal = await resolveExisting(dirInput);
  const target = path.join(dirReal, validateName(name));
  assertInside(target);
  return target;
}

export function assertNotInsideSelf(
  source: string,
  destinationDir: string,
): void {
  if (
    destinationDir === source ||
    destinationDir.startsWith(source + path.sep)
  ) {
    throw fmError("destination_inside_source", destinationDir);
  }
}

export function parentOf(absolutePath: string): string | null {
  if (absolutePath === root) return null;
  return path.dirname(absolutePath);
}
