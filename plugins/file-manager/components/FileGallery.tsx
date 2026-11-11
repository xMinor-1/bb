import {
  memo,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";

import type { FileEntry } from "../contract";
import { isImageEntry, previewUrl } from "../lib/preview";
import { cn } from "@/lib/utils";
import { entryIconName, isDirectoryEntry, rowDomId } from "./FileRow";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { defineMessages, useMessages } from "../lib/i18n";

const messages = defineMessages(
  {
    select: (name: string) => `Select ${name}`,
    symlink: "Symbolic link",
    files: "Files",
  },
  {
    select: (name) => `Выбрать ${name}`,
    symlink: "Символическая ссылка",
    files: "Файлы",
  },
);

const SKELETON_TILES = 8;

const GRID_CLASSES =
  "grid grid-cols-2 gap-2 @md:grid-cols-3 @lg:grid-cols-4 @2xl:grid-cols-6";

export interface FileGalleryProps {
  entries: readonly FileEntry[];
  loading: boolean;
  selectedPaths: ReadonlySet<string>;
  focusedPath: string | null;
  cutPaths: ReadonlySet<string>;
  dragEnabled: boolean;
  dropTargetPath: string | null;
  previewBaseUrl: string | null;
  parentPath: string | null;
  onNavigateParent: () => void;
  onRowClick: (entry: FileEntry, event: MouseEvent<HTMLElement>) => void;
  onRowDoubleClick: (entry: FileEntry) => void;
  onRowContextMenu: (entry: FileEntry, event: MouseEvent<HTMLElement>) => void;
  onToggleSelect: (entry: FileEntry) => void;
  onRowDragStart: (entry: FileEntry, event: DragEvent<HTMLElement>) => void;
  onRowDragOver: (entry: FileEntry, event: DragEvent<HTMLElement>) => void;
  onRowDragLeave: (entry: FileEntry, event: DragEvent<HTMLElement>) => void;
  onRowDrop: (entry: FileEntry, event: DragEvent<HTMLElement>) => void;
  onRowDragEnd: (event: DragEvent<HTMLElement>) => void;
  onParentDragOver: (event: DragEvent<HTMLElement>) => void;
  onParentDragLeave: (event: DragEvent<HTMLElement>) => void;
  onParentDrop: (event: DragEvent<HTMLElement>) => void;
  gridRef?: RefObject<HTMLDivElement | null>;
  emptyState?: ReactNode;
}

interface GalleryTileProps {
  entry: FileEntry;
  dragEnabled: boolean;
  selected: boolean;
  focused: boolean;
  cut: boolean;
  dropTarget: boolean;
  thumbnailUrl: string | null;
  onRowClick: (entry: FileEntry, event: MouseEvent<HTMLElement>) => void;
  onRowDoubleClick: (entry: FileEntry) => void;
  onRowContextMenu: (entry: FileEntry, event: MouseEvent<HTMLElement>) => void;
  onToggleSelect: (entry: FileEntry) => void;
  onRowDragStart: (entry: FileEntry, event: DragEvent<HTMLElement>) => void;
  onRowDragOver: (entry: FileEntry, event: DragEvent<HTMLElement>) => void;
  onRowDragLeave: (entry: FileEntry, event: DragEvent<HTMLElement>) => void;
  onRowDrop: (entry: FileEntry, event: DragEvent<HTMLElement>) => void;
  onRowDragEnd: (event: DragEvent<HTMLElement>) => void;
}

function GalleryTileImpl({
  entry,
  dragEnabled,
  selected,
  focused,
  cut,
  dropTarget,
  thumbnailUrl,
  onRowClick,
  onRowDoubleClick,
  onRowContextMenu,
  onToggleSelect,
  onRowDragStart,
  onRowDragOver,
  onRowDragLeave,
  onRowDrop,
  onRowDragEnd,
}: GalleryTileProps) {
  const t = useMessages(messages);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = thumbnailUrl !== null && failedSrc !== thumbnailUrl;
  const directory = isDirectoryEntry(entry);

  return (
    <div
      role="option"
      id={rowDomId(entry.path)}
      aria-selected={selected}
      data-testid="fm-tile"
      data-fm-path={entry.path}
      data-selected={selected ? "true" : undefined}
      data-drop-target={dropTarget ? "true" : undefined}
      tabIndex={-1}
      draggable={dragEnabled}
      title={entry.name}
      className={cn(
        "group flex min-w-0 cursor-default flex-col gap-1 rounded-md p-1.5 select-none",
        "hover:bg-state-hover",
        selected && "bg-surface-selected hover:bg-surface-selected",
        focused && "ring-1 ring-inset ring-ring",
        cut && "opacity-50",
        dropTarget && "ring-2 ring-inset ring-primary/50",
        entry.escapesRoot && "text-muted-foreground opacity-60",
      )}
      onClick={(event) => onRowClick(entry, event)}
      onDoubleClick={() => onRowDoubleClick(entry)}
      onContextMenu={(event) => onRowContextMenu(entry, event)}
      onDragStart={(event) => onRowDragStart(entry, event)}
      onDragOver={(event) => onRowDragOver(entry, event)}
      onDragLeave={(event) => onRowDragLeave(entry, event)}
      onDrop={(event) => onRowDrop(entry, event)}
      onDragEnd={onRowDragEnd}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-surface-recessed">
        {showImage && thumbnailUrl !== null ? (
          <img
            src={thumbnailUrl}
            alt=""
            data-testid="fm-tile-image"
            loading="lazy"
            decoding="async"
            draggable={false}
            className="size-full object-cover"
            onError={() => setFailedSrc(thumbnailUrl)}
          />
        ) : (
          <div
            className="flex size-full items-center justify-center"
            data-testid="fm-tile-icon"
          >
            <Icon
              name={entryIconName(entry)}
              className={cn(
                "size-8",
                directory ? "text-foreground" : "text-muted-foreground",
              )}
              aria-hidden="true"
            />
          </div>
        )}

        {}
        <div
          className={cn(
            "absolute left-1 top-1 rounded-sm bg-background/80 p-0.5",
            !selected &&
              "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
          )}
          onClick={(event) => {
            event.stopPropagation();
            onToggleSelect(entry);
          }}
        >
          <Checkbox
            checked={selected}
            tabIndex={-1}
            aria-label={t.select(entry.name)}
            onCheckedChange={() => undefined}
          />
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-1">
        <span className="truncate text-xs">{entry.name}</span>
        {entry.isSymlink ? (
          <Icon
            name="ExternalLink"
            className="size-3 shrink-0 text-muted-foreground"
            aria-label={t.symlink}
          />
        ) : null}
      </div>
    </div>
  );
}

const GalleryTile = memo(GalleryTileImpl);

export function FileGallery(props: FileGalleryProps) {
  const t = useMessages(messages);
  const {
    entries,
    loading,
    selectedPaths,
    focusedPath,
    cutPaths,
    dropTargetPath,
    previewBaseUrl,
    parentPath,
    onNavigateParent,
    gridRef,
    emptyState,
  } = props;

  const focusOnScreen =
    focusedPath !== null && entries.some((entry) => entry.path === focusedPath);

  return (
    <div className="flex flex-col gap-2 p-3">
      {parentPath === null ? null : (
        <button
          type="button"
          data-testid="fm-gallery-parent"
          data-fm-parent={parentPath}
          data-drop-target={dropTargetPath === parentPath ? "true" : undefined}
          className={cn(
            "flex h-8 shrink-0 items-center gap-2 self-start rounded-md px-2 text-sm text-muted-foreground",
            "hover:bg-state-hover hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            dropTargetPath === parentPath &&
              "ring-2 ring-inset ring-primary/50",
          )}
          onClick={onNavigateParent}
          onDragOver={props.onParentDragOver}
          onDragLeave={props.onParentDragLeave}
          onDrop={props.onParentDrop}
        >
          <Icon name="FolderOpen" className="size-4" aria-hidden="true" />
          <span>..</span>
        </button>
      )}

      <div
        ref={gridRef}
        role="listbox"
        aria-multiselectable="true"
        aria-label={t.files}
        tabIndex={0}
        aria-activedescendant={
          focusOnScreen && focusedPath !== null
            ? rowDomId(focusedPath)
            : undefined
        }
        data-testid="fm-gallery"
        className={cn(GRID_CLASSES, "outline-none")}
      >
        {loading && entries.length === 0
          ? Array.from({ length: SKELETON_TILES }, (_unused, index) => (
              <div
                key={`skeleton-${String(index)}`}
                data-testid="fm-skeleton-tile"
                className="flex flex-col gap-1 p-1.5"
              >
                <div className="aspect-square w-full animate-pulse rounded-md bg-surface-recessed" />
                <div className="h-3 w-2/3 animate-pulse rounded-sm bg-surface-recessed" />
              </div>
            ))
          : entries.map((entry) => (
              <GalleryTile
                key={entry.path}
                entry={entry}
                dragEnabled={props.dragEnabled}
                selected={selectedPaths.has(entry.path)}
                focused={focusedPath === entry.path}
                cut={cutPaths.has(entry.path)}
                dropTarget={dropTargetPath === entry.path}
                thumbnailUrl={
                  previewBaseUrl !== null && isImageEntry(entry)
                    ? previewUrl(previewBaseUrl, entry.name)
                    : null
                }
                onRowClick={props.onRowClick}
                onRowDoubleClick={props.onRowDoubleClick}
                onRowContextMenu={props.onRowContextMenu}
                onToggleSelect={props.onToggleSelect}
                onRowDragStart={props.onRowDragStart}
                onRowDragOver={props.onRowDragOver}
                onRowDragLeave={props.onRowDragLeave}
                onRowDrop={props.onRowDrop}
                onRowDragEnd={props.onRowDragEnd}
              />
            ))}
      </div>

      {!loading && entries.length === 0 && emptyState !== undefined
        ? emptyState
        : null}
    </div>
  );
}
