import { useEffect, useRef } from "react";

import type { Bookmark } from "../contract";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { actionMessages } from "./action-messages";
import { defineMessages, useMessages } from "../lib/i18n";

const messages = defineMessages(
  {
    bookmarks: "Bookmarks",
    renameBookmark: "Rename this bookmark…",
    empty: "No bookmarks yet",
    gone: (path: string) =>
      `${path} is gone — choose this row to remove the bookmark`,
    missing: "Missing — remove",
  },
  {
    bookmarks: "Закладки",
    renameBookmark: "Переименовать закладку…",
    empty: "Закладок пока нет",
    gone: (path) =>
      `${path} больше нет — выберите строку, чтобы убрать закладку`,
    missing: "Нет — убрать",
  },
);

export interface BookmarkMenuItemsProps {
  bookmarks: readonly Bookmark[];
  currentBookmarked: boolean;
  ready: boolean;
  onNavigate: (path: string) => void;
  onToggleCurrent: () => void;
  onRenameCurrent: () => void;
  onRemove: (path: string) => void;
  onRefresh: () => void;
}

export function BookmarkMenuItems({
  bookmarks,
  currentBookmarked,
  ready,
  onNavigate,
  onToggleCurrent,
  onRenameCurrent,
  onRemove,
  onRefresh,
}: BookmarkMenuItemsProps) {
  const t = useMessages(messages);
  const a = useMessages(actionMessages);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  useEffect(() => {
    refreshRef.current();
  }, []);

  return (
    <>
      <DropdownMenuLabel>{t.bookmarks}</DropdownMenuLabel>

      {}
      <DropdownMenuItem
        disabled={!ready}
        data-testid="fm-bookmark-toggle-item"
        onSelect={onToggleCurrent}
      >
        <Icon
          name={currentBookmarked ? "PinOff" : "Star"}
          className="size-4"
          aria-hidden="true"
        />
        {currentBookmarked ? a.removeBookmark : a.bookmarkFolder}
      </DropdownMenuItem>

      {currentBookmarked ? (
        <DropdownMenuItem
          data-testid="fm-bookmark-rename"
          onSelect={onRenameCurrent}
        >
          <Icon name="Edit" className="size-4" aria-hidden="true" />
          {t.renameBookmark}
        </DropdownMenuItem>
      ) : null}

      <DropdownMenuSeparator />

      {bookmarks.length === 0 ? (
        <DropdownMenuItem disabled data-testid="fm-bookmarks-empty">
          {t.empty}
        </DropdownMenuItem>
      ) : (
        bookmarks.map((bookmark) =>
          bookmark.available ? (
            <DropdownMenuItem
              key={bookmark.path}
              data-testid="fm-bookmark"
              data-fm-path={bookmark.path}
              title={bookmark.path}
              onSelect={() => onNavigate(bookmark.path)}
            >
              <Icon name="Folder" className="size-4" aria-hidden="true" />
              <span className="truncate">{bookmark.name}</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              key={bookmark.path}
              data-testid="fm-bookmark-missing"
              data-fm-path={bookmark.path}
              title={t.gone(bookmark.path)}
              onSelect={() => onRemove(bookmark.path)}
            >
              <Icon name="Trash2" className="size-4" aria-hidden="true" />
              <span className="truncate text-muted-foreground line-through">
                {bookmark.name}
              </span>
              {}
              <DropdownMenuShortcut className="tracking-normal">
                {t.missing}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          ),
        )
      )}
    </>
  );
}

export interface BookmarksMenuProps extends BookmarkMenuItemsProps {
  className?: string;
}

export function BookmarksMenu({ className, ...items }: BookmarksMenuProps) {
  const t = useMessages(messages);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("h-8 w-8 shrink-0 p-0", className)}
          aria-label={t.bookmarks}
          data-testid="fm-bookmarks-menu"
        >
          <Icon name="ChevronDown" className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      {}
      <DropdownMenuContent
        align="end"
        className="max-h-80 w-60 overflow-y-auto"
        data-testid="fm-bookmarks-list"
      >
        <BookmarkMenuItems {...items} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
