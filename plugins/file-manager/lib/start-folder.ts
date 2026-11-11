import { getClientRoot, isSamePath, toAbsolute, toRelative } from "./fm-paths";
import type { FileManagerRpc } from "./fm-rpc";
import { defineMessages, messagesNow } from "./i18n";

export const startFolderMessages = defineMessages(
  {
    saved: "Start folder saved",
    saveFailed: "Could not save the start folder.",
    home: "Home",
    homeInSentence: "Home",
  },
  {
    saved: "Стартовая папка сохранена",
    saveFailed: "Не удалось сохранить стартовую папку.",
    home: "Домашняя папка",
    homeInSentence: "домашняя папка",
  },
);

export async function saveStartFolder(
  rpc: FileManagerRpc,
  path: string,
): Promise<string> {
  const result = await rpc.call("savePreferences", { startFolder: path });
  return result.startFolder;
}

export function startFolderLabel(
  absolute: string,
  root: string = getClientRoot(),
  rootLabel: string = messagesNow(startFolderMessages).home,
): string {
  const relative = toRelative(absolute, root);
  return relative === "" ? rootLabel : relative;
}

export function isExternalSettingChange(
  previous: unknown,
  next: unknown,
): boolean {
  return typeof previous === "string" && previous !== next;
}

export function isExternalBooleanSettingChange(
  previous: unknown,
  next: unknown,
): boolean {
  return typeof previous === "boolean" && previous !== next;
}

export function startFolderNotInUse(
  rawSetting: unknown,
  resolved: string,
  root: string,
): string | null {
  if (typeof rawSetting !== "string" || rawSetting.trim() === "") return null;
  if (!isSamePath(resolved, root)) return null;
  const configured = toAbsolute(rawSetting, root);
  if (isSamePath(configured, root)) return null;
  return configured;
}
