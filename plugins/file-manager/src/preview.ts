import { open, stat } from "node:fs/promises";
import type { Stats } from "node:fs";
import type { BbPluginApi } from "@get-bb/plugin-sdk";

import { MAX_TEXT_PREVIEW_BYTES, PREVIEW_TTL_MS } from "../contract";
import { fmError, mapNodeError } from "./errors";
import { resolveExisting, resolveExistingDir } from "./root";

export interface CreatePreviewUrlInput {
  path: string;
}

export interface CreatePreviewUrlOutput {
  baseUrl: string;
  path: string;
  expiresAtMs: number;
}

export async function createPreviewUrl(
  bb: BbPluginApi,
  input: CreatePreviewUrlInput,
): Promise<CreatePreviewUrlOutput> {
  const dir = await resolveExistingDir(input.path);

  let preview: { baseUrl: string; expiresAtMs: number };
  try {
    preview = await bb.sdk.files.createPreview({
      rootPath: dir,
      ttlMs: PREVIEW_TTL_MS,
    });
  } catch (error) {
    bb.log.warn(`could not create a preview URL for ${dir}: ${String(error)}`);
    throw fmError("unsupported", "previews are not available on this server");
  }

  return {
    baseUrl: preview.baseUrl,
    path: dir,
    expiresAtMs: preview.expiresAtMs,
  };
}

export interface ReadTextFileInput {
  path: string;
}

export interface ReadTextFileOutput {
  path: string;
  text: string;
  sizeBytes: number;
  readBytes: number;
  truncated: boolean;
}

function decodeUtf8(bytes: Uint8Array, truncated: boolean): string | null {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const maxTrim = truncated ? 3 : 0;
  for (let trim = 0; trim <= maxTrim; trim += 1) {
    try {
      return decoder.decode(bytes.subarray(0, bytes.length - trim));
    } catch {}
  }
  return null;
}

export async function readTextFile(
  input: ReadTextFileInput,
): Promise<ReadTextFileOutput> {
  const absolutePath = await resolveExisting(input.path);

  let stats: Stats;
  try {
    stats = await stat(absolutePath);
  } catch (error) {
    throw mapNodeError(error, absolutePath);
  }
  if (!stats.isFile()) throw fmError("not_a_file", absolutePath);

  const window = Math.min(stats.size, MAX_TEXT_PREVIEW_BYTES);
  const buffer = Buffer.alloc(window);
  let readBytes = 0;
  const handle = await open(absolutePath, "r").catch((error: unknown) => {
    throw mapNodeError(error, absolutePath);
  });
  try {
    if (window > 0) {
      const result = await handle.read(buffer, 0, window, 0);
      readBytes = result.bytesRead;
    }
  } catch (error) {
    throw mapNodeError(error, absolutePath);
  } finally {
    await handle.close();
  }

  const bytes = buffer.subarray(0, readBytes);
  if (bytes.includes(0))
    throw fmError("unsupported", `${absolutePath} is not a text file`);

  const truncated = stats.size > readBytes;
  const text = decodeUtf8(bytes, truncated);
  if (text === null)
    throw fmError("unsupported", `${absolutePath} is not a text file`);

  return {
    path: absolutePath,
    text,
    sizeBytes: stats.size,
    readBytes: Buffer.byteLength(text, "utf8"),
    truncated,
  };
}
