import { createReadStream } from "node:fs";
import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

import { fmError } from "./errors";
import { isInside, resolveExisting, resolveExistingDir } from "./root";

export const MAX_ZIP_ENTRIES = 20_000;

export interface ZipItem {
  name: string;
  source: string | null;
  size: number;
  mtime: Date;
  mode: number;
}

function splitRelative(name: string): string[] {
  const parts = name.split("/");
  for (const part of parts) {
    // eslint-disable-next-line no-control-regex -- deliberate: reject control chars
    if (
      part === "" ||
      part === "." ||
      part === ".." ||
      /[\x00-\x1f]/u.test(part)
    ) {
      throw fmError("invalid_name", name);
    }
  }
  return parts;
}

export async function collectZipItems(
  dir: string,
  names: readonly string[],
): Promise<ZipItem[]> {
  const base = await resolveExistingDir(dir);
  const items: ZipItem[] = [];
  const seen = new Set<string>();

  const push = (item: ZipItem): void => {
    if (seen.has(item.name)) return;
    if (items.length >= MAX_ZIP_ENTRIES) {
      throw fmError(
        "unsupported",
        `more than ${String(MAX_ZIP_ENTRIES)} files and folders`,
      );
    }
    seen.add(item.name);
    items.push(item);
  };

  const walk = async (absolute: string, prefix: string): Promise<void> => {
    let children;
    try {
      children = await readdir(absolute, { withFileTypes: true });
    } catch {
      return;
    }
    children.sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
    for (const child of children) {
      const childPath = path.join(absolute, child.name);
      const childName = `${prefix}/${child.name}`;
      if (child.isSymbolicLink()) {
        try {
          const target = await realpath(childPath);
          if (!isInside(target)) continue;
          const st = await stat(target);
          if (st.isFile())
            push({
              name: childName,
              source: target,
              size: st.size,
              mtime: st.mtime,
              mode: st.mode,
            });
        } catch {}
        continue;
      }
      if (!child.isFile() && !child.isDirectory()) continue;
      let st;
      try {
        st = await stat(childPath);
      } catch {
        continue;
      }
      if (child.isDirectory()) {
        push({
          name: childName,
          source: null,
          size: 0,
          mtime: st.mtime,
          mode: st.mode,
        });
        await walk(childPath, childName);
      } else {
        push({
          name: childName,
          source: childPath,
          size: st.size,
          mtime: st.mtime,
          mode: st.mode,
        });
      }
    }
  };

  for (const name of names) {
    const parts = splitRelative(name);
    const absolute = await resolveExisting(path.join(base, ...parts));
    const st = await stat(absolute);
    const archiveName = parts.join("/");
    if (st.isDirectory()) {
      push({
        name: archiveName,
        source: null,
        size: 0,
        mtime: st.mtime,
        mode: st.mode,
      });
      await walk(absolute, archiveName);
    } else if (st.isFile()) {
      push({
        name: archiveName,
        source: absolute,
        size: st.size,
        mtime: st.mtime,
        mode: st.mode,
      });
    }
  }
  return items;
}

const MAX32 = 0xffffffff;
const MAX16 = 0xffff;
const FLAGS = 0x0808;
const MADE_BY = (3 << 8) | 45;

const LOCAL_HEADER = 30;
const CENTRAL_HEADER = 46;
const ZIP64_EXTRA = 28;
const EOCD = 22;
const ZIP64_EOCD = 56;
const ZIP64_LOCATOR = 20;

interface Placed {
  item: ZipItem;
  nameBytes: Buffer;
  offset: number;
  bigSize: boolean;
  bigRecord: boolean;
}

interface Layout {
  placed: Placed[];
  centralOffset: number;
  centralSize: number;
  zip64End: boolean;
  totalBytes: number;
}

function archiveName(item: ZipItem): Buffer {
  return Buffer.from(
    item.source === null ? `${item.name}/` : item.name,
    "utf8",
  );
}

function layout(items: readonly ZipItem[]): Layout {
  const placed: Placed[] = [];
  let offset = 0;
  for (const item of items) {
    const nameBytes = archiveName(item);
    const bigSize = item.size >= MAX32;
    placed.push({
      item,
      nameBytes,
      offset,
      bigSize,
      bigRecord: bigSize || offset >= MAX32,
    });
    offset += LOCAL_HEADER + nameBytes.length + item.size + (bigSize ? 24 : 16);
  }
  const centralOffset = offset;
  let centralSize = 0;
  for (const entry of placed) {
    centralSize +=
      CENTRAL_HEADER +
      entry.nameBytes.length +
      (entry.bigRecord ? ZIP64_EXTRA : 0);
  }
  const zip64End =
    placed.length >= MAX16 || centralOffset >= MAX32 || centralSize >= MAX32;
  const totalBytes =
    centralOffset +
    centralSize +
    (zip64End ? ZIP64_EOCD + ZIP64_LOCATOR : 0) +
    EOCD;
  return { placed, centralOffset, centralSize, zip64End, totalBytes };
}

export function zipLength(items: readonly ZipItem[]): number {
  return layout(items).totalBytes;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = date.getFullYear();
  if (year < 1980) return { time: 0, date: (1 << 5) | 1 };
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
    date:
      ((Math.min(year, 2107) - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate(),
  };
}

function localHeader(entry: Placed): Buffer {
  const { time, date } = dosDateTime(entry.item.mtime);
  const header = Buffer.alloc(LOCAL_HEADER);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(entry.bigSize ? 45 : 20, 4);
  header.writeUInt16LE(FLAGS, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(time, 10);
  header.writeUInt16LE(date, 12);
  header.writeUInt16LE(entry.nameBytes.length, 26);
  return Buffer.concat([header, entry.nameBytes]);
}

function descriptor(entry: Placed, crc: number): Buffer {
  const size = entry.item.size;
  if (entry.bigSize) {
    const record = Buffer.alloc(24);
    record.writeUInt32LE(0x08074b50, 0);
    record.writeUInt32LE(crc, 4);
    record.writeBigUInt64LE(BigInt(size), 8);
    record.writeBigUInt64LE(BigInt(size), 16);
    return record;
  }
  const record = Buffer.alloc(16);
  record.writeUInt32LE(0x08074b50, 0);
  record.writeUInt32LE(crc, 4);
  record.writeUInt32LE(size, 8);
  record.writeUInt32LE(size, 12);
  return record;
}

function centralHeader(entry: Placed, crc: number): Buffer {
  const { item, nameBytes, offset, bigRecord } = entry;
  const { time, date } = dosDateTime(item.mtime);
  const folder = item.source === null;
  const record = Buffer.alloc(
    CENTRAL_HEADER + nameBytes.length + (bigRecord ? ZIP64_EXTRA : 0),
  );
  record.writeUInt32LE(0x02014b50, 0);
  record.writeUInt16LE(MADE_BY, 4);
  record.writeUInt16LE(bigRecord ? 45 : 20, 6);
  record.writeUInt16LE(FLAGS, 8);
  record.writeUInt16LE(0, 10);
  record.writeUInt16LE(time, 12);
  record.writeUInt16LE(date, 14);
  record.writeUInt32LE(crc, 16);
  record.writeUInt32LE(bigRecord ? MAX32 : item.size, 20);
  record.writeUInt32LE(bigRecord ? MAX32 : item.size, 24);
  record.writeUInt16LE(nameBytes.length, 28);
  record.writeUInt16LE(bigRecord ? ZIP64_EXTRA : 0, 30);
  record.writeUInt32LE(
    (((item.mode & 0xffff) << 16) | (folder ? 0x10 : 0)) >>> 0,
    38,
  );
  record.writeUInt32LE(bigRecord ? MAX32 : offset, 42);
  nameBytes.copy(record, CENTRAL_HEADER);
  if (bigRecord) {
    const extra = CENTRAL_HEADER + nameBytes.length;
    record.writeUInt16LE(0x0001, extra);
    record.writeUInt16LE(ZIP64_EXTRA - 4, extra + 2);
    record.writeBigUInt64LE(BigInt(item.size), extra + 4);
    record.writeBigUInt64LE(BigInt(item.size), extra + 12);
    record.writeBigUInt64LE(BigInt(offset), extra + 20);
  }
  return record;
}

function endRecords(plan: Layout): Buffer {
  const count = plan.placed.length;
  const parts: Buffer[] = [];
  if (plan.zip64End) {
    const zip64End = Buffer.alloc(ZIP64_EOCD);
    zip64End.writeUInt32LE(0x06064b50, 0);
    zip64End.writeBigUInt64LE(BigInt(ZIP64_EOCD - 12), 4);
    zip64End.writeUInt16LE(MADE_BY, 12);
    zip64End.writeUInt16LE(45, 14);
    zip64End.writeBigUInt64LE(BigInt(count), 24);
    zip64End.writeBigUInt64LE(BigInt(count), 32);
    zip64End.writeBigUInt64LE(BigInt(plan.centralSize), 40);
    zip64End.writeBigUInt64LE(BigInt(plan.centralOffset), 48);
    const locator = Buffer.alloc(ZIP64_LOCATOR);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeBigUInt64LE(BigInt(plan.centralOffset + plan.centralSize), 8);
    locator.writeUInt32LE(1, 16);
    parts.push(zip64End, locator);
  }
  const end = Buffer.alloc(EOCD);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Math.min(count, MAX16), 8);
  end.writeUInt16LE(Math.min(count, MAX16), 10);
  end.writeUInt32LE(Math.min(plan.centralSize, MAX32), 12);
  end.writeUInt32LE(Math.min(plan.centralOffset, MAX32), 16);
  parts.push(end);
  return Buffer.concat(parts);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1)
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

const nativeCrc32 = (
  zlib as { crc32?: (data: Uint8Array, value?: number) => number }
).crc32;

function crc32(data: Uint8Array, previous: number): number {
  if (nativeCrc32 !== undefined) return nativeCrc32(data, previous);
  let crc = ~previous >>> 0;
  for (const byte of data)
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return ~crc >>> 0;
}

export async function* zipStream(
  items: readonly ZipItem[],
): AsyncGenerator<Buffer> {
  const plan = layout(items);
  const crcs: number[] = [];
  for (const entry of plan.placed) {
    yield localHeader(entry);
    let crc = 0;
    let read = 0;
    const { source, size } = entry.item;
    if (source !== null && size > 0) {
      for await (const chunk of createReadStream(source, {
        start: 0,
        end: size - 1,
      })) {
        const bytes = chunk as Buffer;
        crc = crc32(bytes, crc);
        read += bytes.length;
        yield bytes;
      }
    }
    if (read !== size) {
      throw new Error(`${entry.item.name} changed while it was being zipped`);
    }
    crcs.push(crc);
    yield descriptor(entry, crc);
  }
  yield Buffer.concat(
    plan.placed.map((entry, index) => centralHeader(entry, crcs[index] ?? 0)),
  );
  yield endRecords(plan);
}
