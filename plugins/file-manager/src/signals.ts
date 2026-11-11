import type { BbPluginApi } from "@get-bb/plugin-sdk";

import { FS_CHANNEL, type FsSignal } from "../contract";

export type FsReason = FsSignal["reason"];

export function publishFs(
  bb: BbPluginApi,
  paths: readonly string[],
  reason: FsReason,
): void {
  const unique = [
    ...new Set(
      paths.filter((entry) => typeof entry === "string" && entry !== ""),
    ),
  ];
  if (unique.length === 0) return;
  const payload: FsSignal = { paths: unique, reason };
  try {
    bb.realtime.publish(FS_CHANNEL, payload);
  } catch (error) {
    bb.log.warn(`fs signal (${reason}) not published: ${String(error)}`);
  }
}
