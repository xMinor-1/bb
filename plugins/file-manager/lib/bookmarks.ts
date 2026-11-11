import { MAX_BOOKMARKS, type Bookmark } from "../contract";
import { isSamePath } from "./fm-paths";
import { defineMessages } from "./i18n";

export const bookmarkMessages = defineMessages(
  {
    addFailed: "Could not add that bookmark.",
    removeFailed: "Could not remove that bookmark.",
    renameFailed: "Could not rename that bookmark.",
    full: `You can keep ${String(MAX_BOOKMARKS)} bookmarks. Remove one before adding another.`,
  },
  {
    addFailed: "Не удалось добавить закладку.",
    removeFailed: "Не удалось убрать закладку.",
    renameFailed: "Не удалось переименовать закладку.",
    full: `Можно хранить не больше ${String(MAX_BOOKMARKS)} закладок. Уберите одну, чтобы добавить новую.`,
  },
);

export function isBookmarked(
  bookmarks: readonly Bookmark[],
  path: string,
): boolean {
  if (path === "") return false;
  return bookmarks.some((bookmark) => isSamePath(bookmark.path, path));
}

export function findBookmark(
  bookmarks: readonly Bookmark[],
  path: string,
): Bookmark | null {
  if (path === "") return null;
  return bookmarks.find((bookmark) => isSamePath(bookmark.path, path)) ?? null;
}
