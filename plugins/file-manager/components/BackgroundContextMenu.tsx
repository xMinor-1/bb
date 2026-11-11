import { useMenuPointerGuard } from "../hooks/useMenuPointerGuard";
import {
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
} from "@/components/ui/context-menu";
import { Icon } from "@/components/ui/icon";
import { actionMessages } from "./action-messages";
import { useMessages } from "../lib/i18n";

export interface BackgroundContextMenuProps {
  writable: boolean;
  canPaste: boolean;
  showHidden: boolean;
  onNewFolder: () => void;
  onUpload: () => void;
  onPaste: () => void;
  onSelectAll: () => void;
  onRefresh: () => void;
  onToggleHidden: () => void;
  expandedCount: number;
  onCollapseAll: () => void;
  onCopyPath: () => void;
  onSetStartFolder: () => void;
  onProperties: () => void;
  bookmarked: boolean;
  canToggleBookmark: boolean;
  onToggleBookmark: () => void;
}

export function BackgroundContextMenu({
  writable,
  canPaste,
  showHidden,
  onNewFolder,
  onUpload,
  onPaste,
  onSelectAll,
  onRefresh,
  onToggleHidden,
  expandedCount,
  onCollapseAll,
  onCopyPath,
  onSetStartFolder,
  onProperties,
  bookmarked,
  canToggleBookmark,
  onToggleBookmark,
}: BackgroundContextMenuProps) {
  const pointerGuard = useMenuPointerGuard();
  const t = useMessages(actionMessages);

  return (
    <ContextMenuContent
      className="w-56"
      data-testid="fm-background-menu"
      {...pointerGuard}
    >
      <ContextMenuItem disabled={!writable} onSelect={onNewFolder}>
        <Icon name="FolderPlus" className="size-4" aria-hidden="true" />
        {t.newFolder}
        <ContextMenuShortcut>Ctrl+Shift+N</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem disabled={!writable} onSelect={onUpload}>
        <Icon name="PackageReceive" className="size-4" aria-hidden="true" />
        {t.uploadFiles}
      </ContextMenuItem>
      <ContextMenuItem disabled={!canPaste || !writable} onSelect={onPaste}>
        <Icon name="Copy" className="size-4" aria-hidden="true" />
        {t.paste}
        <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem onSelect={onSelectAll}>
        <Icon name="Check" className="size-4" aria-hidden="true" />
        {t.selectAll}
        <ContextMenuShortcut>Ctrl+A</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onSelect={onRefresh}>
        <Icon
          name="ArrowReloadHorizontal"
          className="size-4"
          aria-hidden="true"
        />
        {t.refresh}
      </ContextMenuItem>
      <ContextMenuCheckboxItem checked={showHidden} onSelect={onToggleHidden}>
        {t.showHidden}
        <ContextMenuShortcut>Ctrl+Shift+.</ContextMenuShortcut>
      </ContextMenuCheckboxItem>
      <ContextMenuItem disabled={expandedCount === 0} onSelect={onCollapseAll}>
        <Icon name="Minimize2" className="size-4" aria-hidden="true" />
        {t.collapseAll}
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem onSelect={onCopyPath}>
        <Icon name="Paperclip" className="size-4" aria-hidden="true" />
        {t.copyFolderPath}
      </ContextMenuItem>
      <ContextMenuItem onSelect={onSetStartFolder}>
        <Icon name="Pin" className="size-4" aria-hidden="true" />
        {t.setStartFolder}
      </ContextMenuItem>
      {}
      <ContextMenuItem
        disabled={!canToggleBookmark}
        data-testid="fm-background-bookmark"
        onSelect={onToggleBookmark}
      >
        <Icon
          name={bookmarked ? "PinOff" : "Star"}
          className="size-4"
          aria-hidden="true"
        />
        {bookmarked ? t.removeBookmark : t.bookmarkFolder}
      </ContextMenuItem>
      <ContextMenuItem onSelect={onProperties}>
        <Icon name="Info" className="size-4" aria-hidden="true" />
        {t.properties}
        <ContextMenuShortcut>Alt+Enter</ContextMenuShortcut>
      </ContextMenuItem>
    </ContextMenuContent>
  );
}
