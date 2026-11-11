import { open, stat } from "node:fs/promises";
import path from "node:path";
import type { Stats } from "node:fs";
import type {
  BbPluginApi,
  PluginMentionItem,
  PluginMentionProviderRegistration,
  PluginMentionSearchContext,
} from "@get-bb/plugin-sdk";

import { MENTION_PROVIDER_ID, MENTION_PROVIDER_LABEL } from "../contract";
import { searchDir } from "./listing";
import { getRoot, resolveExisting } from "./root";

const SEARCH_LIMIT = 20;
const SEARCH_DEPTH = 4;
const SEARCH_BUDGET_MS = 1_500;
const SEARCH_CANDIDATES = SEARCH_LIMIT * 4;

export const MAX_CONTEXT_BYTES = 256 * 1024;
const SNIFF_BYTES = 8 * 1024;
const REPLACEMENT_RATIO = 0.01;

function relativeLabel(absolutePath: string): string {
  const root = getRoot();
  if (absolutePath === root) return "~";
  if (!absolutePath.startsWith(root + path.sep)) return absolutePath;
  return `~${absolutePath.slice(root.length)}`;
}

export async function searchFiles(
  ctx: PluginMentionSearchContext,
): Promise<PluginMentionItem[]> {
  const query = ctx.query.trim();
  if (query.length === 0) return [];

  try {
    const result = await searchDir({
      path: getRoot(),
      query,
      showHidden: false,
      maxDepth: SEARCH_DEPTH,
      limit: SEARCH_CANDIDATES,
      budgetMs: SEARCH_BUDGET_MS,
    });

    return result.entries
      .filter((entry) => {
        if (entry.escapesRoot) return false;
        const kind =
          entry.isSymlink && entry.targetKind !== null
            ? entry.targetKind
            : entry.kind;
        return kind === "file";
      })
      .slice(0, SEARCH_LIMIT)
      .map((entry) => ({
        id: entry.path,
        title: entry.name,
        subtitle: relativeLabel(entry.path),
      }));
  } catch {
    return [];
  }
}

function headerFor(absolutePath: string, stats: Stats): string {
  return [
    `File: ${absolutePath}`,
    `Size: ${String(stats.size)} bytes`,
    `Modified: ${new Date(stats.mtimeMs).toISOString()}`,
  ].join("\n");
}

function fenceFor(content: string): string {
  let longest = 0;
  for (const run of content.matchAll(/`+/gu))
    longest = Math.max(longest, run[0].length);
  return "`".repeat(Math.max(3, longest + 1));
}

function languageFor(absolutePath: string): string {
  const extension = path.extname(absolutePath).slice(1).toLowerCase();
  return /^[a-z0-9]+$/u.test(extension) ? extension : "";
}

function looksBinary(buffer: Buffer, decoded: string): boolean {
  if (buffer.subarray(0, SNIFF_BYTES).includes(0)) return true;
  if (decoded.length === 0) return false;
  let replacements = 0;
  for (const character of decoded) if (character === "�") replacements += 1;
  return replacements / decoded.length > REPLACEMENT_RATIO;
}

async function readHead(absolutePath: string): Promise<Buffer> {
  const handle = await open(absolutePath, "r");
  try {
    const buffer = Buffer.alloc(MAX_CONTEXT_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, MAX_CONTEXT_BYTES, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function resolveFile(
  itemId: string,
): Promise<{ context: string }> {
  try {
    const real = await resolveExisting(itemId);
    const stats = await stat(real);
    const header = headerFor(real, stats);

    if (stats.isDirectory()) {
      return {
        context: `${header}\n\nThis is a directory. Its contents are not attached — read it with your own tools if you need them.`,
      };
    }
    if (!stats.isFile()) {
      return {
        context: `${header}\n\nThis is not a regular file, so no content is attached.`,
      };
    }
    if (stats.size === 0) return { context: `${header}\n\nThe file is empty.` };

    const head = await readHead(real);
    const decoded = new TextDecoder("utf-8").decode(head);
    if (looksBinary(head, decoded)) {
      return {
        context: `${header}\n\nThe file is binary, so its content is not attached.`,
      };
    }

    const truncated = head.length < stats.size;
    const fence = fenceFor(decoded);
    const body = `${fence}${languageFor(real)}\n${decoded}\n${fence}`;
    const note = truncated
      ? `\n\n[Truncated: the first ${String(head.length)} of ${String(stats.size)} bytes are shown.]`
      : "";
    return { context: `${header}\n\n${body}${note}` };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      context: `File: ${itemId}\n\nThis file could not be read (${detail}).`,
    };
  }
}

export function createFileMentionProvider(): PluginMentionProviderRegistration {
  return {
    id: MENTION_PROVIDER_ID,
    label: MENTION_PROVIDER_LABEL,
    search: searchFiles,
    resolve: resolveFile,
  };
}

export function registerMentions(bb: BbPluginApi): void {
  bb.ui.registerMentionProvider(createFileMentionProvider());
}
