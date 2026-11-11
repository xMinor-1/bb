import type { BbPluginApi } from "@get-bb/plugin-sdk";
import path from "node:path";

import {
  MAX_BOOKMARKS,
  MAX_BOOKMARK_NAME_LENGTH,
  type Bookmark,
} from "../contract";
import { fmError } from "./errors";
import { assertInside, isInside, normalize, resolveExistingDir } from "./root";

export const BOOKMARKS_KEY = "bookmarks:v1";

interface StoredBookmark {
  path: string;
  name: string;
}

export interface AddBookmarkInput {
  path: string;
  name: string | null;
}

export interface BookmarksResult {
  bookmarks: Bookmark[];
}

export interface BookmarksModule {
  list(): Promise<BookmarksResult>;
  add(input: AddBookmarkInput): Promise<BookmarksResult>;
  remove(input: { path: string }): Promise<BookmarksResult>;
  rename(input: { path: string; name: string }): Promise<BookmarksResult>;
}

// eslint-disable-next-line no-control-regex -- deliberate: reject control chars
const CONTROL_CHARACTERS = /[\x00-\x1f]/u;

function defaultName(absolute: string): string {
  const base = path.basename(absolute);
  return base === "" ? absolute : base;
}

function validateBookmarkName(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") throw fmError("invalid_name", "(empty)");
  if (CONTROL_CHARACTERS.test(trimmed)) throw fmError("invalid_name", trimmed);
  if ([...trimmed].length > MAX_BOOKMARK_NAME_LENGTH) {
    throw fmError("invalid_name", `${trimmed.slice(0, 32)}…`);
  }
  return trimmed;
}

function repairName(input: unknown, absolute: string): string {
  if (typeof input !== "string") return defaultName(absolute);
  const cleaned = input.replace(CONTROL_CHARACTERS, " ").trim();
  if (cleaned === "") return defaultName(absolute);
  const points = [...cleaned];
  return points.length > MAX_BOOKMARK_NAME_LENGTH
    ? points.slice(0, MAX_BOOKMARK_NAME_LENGTH).join("")
    : cleaned;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function decode(raw: unknown): StoredBookmark[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const items: StoredBookmark[] = [];
  for (const candidate of raw) {
    if (!isRecord(candidate)) continue;
    const stored = candidate.path;
    if (typeof stored !== "string" || stored === "") continue;
    const absolute = normalize(stored);
    if (!isInside(absolute)) continue;
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    items.push({ path: absolute, name: repairName(candidate.name, absolute) });
    if (items.length >= MAX_BOOKMARKS) break;
  }
  return items;
}

async function isOpenable(absolute: string): Promise<boolean> {
  try {
    await resolveExistingDir(absolute);
    return true;
  } catch {
    return false;
  }
}

async function decorate(items: readonly StoredBookmark[]): Promise<Bookmark[]> {
  return Promise.all(
    items.map(async (item, index) => ({
      path: item.path,
      name: item.name,
      order: index,
      available: await isOpenable(item.path),
    })),
  );
}

function clampLexically(input: string): string {
  return assertInside(normalize(input));
}

export function createBookmarks(bb: BbPluginApi): BookmarksModule {
  async function read(): Promise<StoredBookmark[]> {
    try {
      return decode(await bb.storage.kv.get<unknown>(BOOKMARKS_KEY));
    } catch (error) {
      bb.log.warn(
        `bookmarks are unreadable (${String(error)}); using an empty list`,
      );
      return [];
    }
  }

  async function write(
    items: readonly StoredBookmark[],
  ): Promise<BookmarksResult> {
    await bb.storage.kv.set(BOOKMARKS_KEY, items);
    return { bookmarks: await decorate(items) };
  }

  return {
    async list(): Promise<BookmarksResult> {
      return { bookmarks: await decorate(await read()) };
    },

    async add(input: AddBookmarkInput): Promise<BookmarksResult> {
      const absolute = await resolveExistingDir(input.path);
      const items = await read();
      const existing = items.findIndex((item) => item.path === absolute);

      if (existing !== -1) {
        if (input.name === null) return { bookmarks: await decorate(items) };
        const renamed = [...items];
        renamed[existing] = {
          path: absolute,
          name: validateBookmarkName(input.name),
        };
        return await write(renamed);
      }

      if (items.length >= MAX_BOOKMARKS) {
        throw fmError(
          "unsupported",
          `the bookmark list is full (${String(MAX_BOOKMARKS)} maximum)`,
        );
      }

      const name =
        input.name === null
          ? defaultName(absolute)
          : validateBookmarkName(input.name);
      return await write([...items, { path: absolute, name }]);
    },

    async remove(input: { path: string }): Promise<BookmarksResult> {
      const absolute = clampLexically(input.path);
      const items = await read();
      const next = items.filter((item) => item.path !== absolute);
      if (next.length === items.length)
        return { bookmarks: await decorate(items) };
      return await write(next);
    },

    async rename(input: {
      path: string;
      name: string;
    }): Promise<BookmarksResult> {
      const absolute = clampLexically(input.path);
      const name = validateBookmarkName(input.name);
      const items = await read();
      const index = items.findIndex((item) => item.path === absolute);
      if (index === -1) throw fmError("not_found", absolute);
      const next = items.map((item, at) =>
        at === index ? { path: item.path, name } : item,
      );
      return await write(next);
    },
  };
}
