import type { DragEvent, ReactNode, RefObject } from "react";

import type { ViewMode } from "../contract";
import type { SortDirection, SortField } from "../hooks/useDirectory";
import { cn } from "@/lib/utils";
import { formatBytes } from "../lib/format";
import { PathBar } from "./PathBar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { actionMessages, sortLabels } from "./action-messages";
import { defineMessages, useMessages } from "../lib/i18n";

const messages = defineMessages(
  {
    filterFolder: "Filter this folder",
    filterPlaceholder: "Filter…",
    hideFilter: "Hide the filter",
    showList: "Show the list view",
    showGallery: "Show the gallery view",
    showHiddenCount: (count: number) =>
      `Show hidden files (${String(count)} hidden)`,
    freeOf: (free: string, total: string) => `${free} free of ${total}`,
    free: (free: string) => `${free} free`,
  },
  {
    filterFolder: "Фильтр по этой папке",
    filterPlaceholder: "Фильтр…",
    hideFilter: "Скрыть фильтр",
    showList: "Показать списком",
    showGallery: "Показать галереей",
    showHiddenCount: (count) =>
      `Показать скрытые файлы (скрыто: ${String(count)})`,
    freeOf: (free, total) => `Свободно ${free} из ${total}`,
    free: (free) => `Свободно ${free}`,
  },
);

export interface ToolbarProps {
  variant?: "wide" | "compact";
  actions?: ReactNode;
  searchOpen?: boolean;
  onSearchOpenChange?: (open: boolean) => void;
  path: string;
  root: string;
  onNavigate: (path: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  sortField: SortField;
  sortDirection: SortDirection;
  onSortFieldChange: (field: SortField) => void;
  onSortDirectionChange: (direction: SortDirection) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  showHidden: boolean;
  onToggleHidden: () => void;
  expandedCount: number;
  onCollapseAll: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  hiddenCount: number;
  bookmarked: boolean;
  canToggleBookmark: boolean;
  onToggleBookmark: () => void;
  bookmarksMenu?: ReactNode;
  volume: { totalBytes: number; freeBytes: number } | null;
  dropTargetPath?: string | null;
  onDragOverCrumb?: (path: string, event: DragEvent<HTMLElement>) => void;
  onDragLeaveCrumb?: (path: string, event: DragEvent<HTMLElement>) => void;
  onDropOnCrumb?: (path: string, event: DragEvent<HTMLElement>) => void;
  pathEditing: boolean;
  onPathOpen: () => void;
  onPathCancel: (options: { focusGrid: boolean }) => void;
  onPathSubmit: (raw: string) => void;
  pathError: string | null;
  onPathDirty: () => void;
  pathBusy?: boolean;
  pathFocusTick: number;
  className?: string;
}

export function Toolbar({
  variant = "wide",
  actions,
  searchOpen = false,
  onSearchOpenChange,
  path,
  root,
  onNavigate,
  query,
  onQueryChange,
  searchInputRef,
  sortField,
  sortDirection,
  onSortFieldChange,
  onSortDirectionChange,
  viewMode,
  onViewModeChange,
  showHidden,
  onToggleHidden,
  expandedCount,
  onCollapseAll,
  onRefresh,
  refreshing,
  hiddenCount,
  bookmarked,
  canToggleBookmark,
  onToggleBookmark,
  bookmarksMenu,
  volume,
  dropTargetPath = null,
  onDragOverCrumb,
  onDragLeaveCrumb,
  onDropOnCrumb,
  pathEditing,
  onPathOpen,
  onPathCancel,
  onPathSubmit,
  pathError,
  onPathDirty,
  pathBusy = false,
  pathFocusTick,
  className,
}: ToolbarProps) {
  const t = useMessages(messages);
  const a = useMessages(actionMessages);
  const SORT_LABELS: Record<SortField, string> = sortLabels(a);
  const compact = variant === "compact";
  const filterExpanded = !compact || searchOpen;

  const filterField = (
    <div
      className={cn(
        "relative",
        compact ? "min-w-0 flex-1" : "w-40 shrink-0 @lg:w-56",
      )}
    >
      <Icon
        name="Search"
        className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        ref={searchInputRef}
        type="search"
        value={query}
        data-testid="fm-search"
        aria-label={t.filterFolder}
        placeholder={t.filterPlaceholder}
        className="h-8 pl-7 text-sm"
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            if (query !== "") {
              event.preventDefault();
              onQueryChange("");
              return;
            }
            if (compact) {
              event.preventDefault();
              onSearchOpenChange?.(false);
              return;
            }
            event.currentTarget.blur();
          }
        }}
      />
    </div>
  );

  return (
    <div
      data-testid="fm-toolbar"
      data-fm-toolbar-variant={variant}
      className={cn(
        "flex shrink-0 items-center gap-2 border-b border-border px-3 py-2",
        className,
      )}
    >
      {filterExpanded && compact ? null : (
        <PathBar
          path={path}
          root={root}
          onNavigate={onNavigate}
          editing={pathEditing}
          onOpen={onPathOpen}
          onCancel={onPathCancel}
          onSubmit={onPathSubmit}
          error={pathError}
          onDirty={onPathDirty}
          busy={pathBusy}
          focusTick={pathFocusTick}
          dropTargetPath={dropTargetPath}
          onDragOverCrumb={onDragOverCrumb}
          onDragLeaveCrumb={onDragLeaveCrumb}
          onDropOnCrumb={onDropOnCrumb}
        />
      )}

      {filterExpanded ? filterField : null}

      {compact ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 shrink-0 p-0"
          aria-label={searchOpen ? t.hideFilter : t.filterFolder}
          aria-pressed={searchOpen}
          data-testid="fm-search-toggle"
          onClick={() => {
            if (searchOpen && query !== "") onQueryChange("");
            onSearchOpenChange?.(!searchOpen);
          }}
        >
          <Icon
            name={searchOpen ? "X" : "Search"}
            className="size-4"
            aria-hidden="true"
          />
        </Button>
      ) : null}

      {}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 shrink-0 p-0"
        aria-pressed={bookmarked}
        aria-label={bookmarked ? a.removeBookmark : a.bookmarkFolder}
        data-testid="fm-bookmark-toggle"
        disabled={!canToggleBookmark}
        onClick={onToggleBookmark}
      >
        <Icon
          name="Star"
          className={cn("size-4", bookmarked && "text-primary")}
          aria-hidden="true"
        />
      </Button>

      {compact ? null : bookmarksMenu}

      {compact ? null : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 shrink-0 p-0"
          aria-pressed={viewMode === "gallery"}
          aria-label={viewMode === "gallery" ? t.showList : t.showGallery}
          data-testid="fm-view-toggle"
          onClick={() =>
            onViewModeChange(viewMode === "gallery" ? "list" : "gallery")
          }
        >
          <Icon
            name={viewMode === "gallery" ? "GridView" : "ListView"}
            className="size-4"
            aria-hidden="true"
          />
        </Button>
      )}

      {compact ? null : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 gap-1 px-2"
              aria-label={a.sort}
              data-testid="fm-sort-menu"
            >
              <Icon name="Sort" className="size-4" aria-hidden="true" />
              <span className="hidden text-xs @lg:inline">
                {SORT_LABELS[sortField]}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>{a.sortBy}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={sortField}
              onValueChange={(value) => onSortFieldChange(value as SortField)}
            >
              {(Object.keys(SORT_LABELS) as SortField[]).map((field) => (
                <DropdownMenuRadioItem key={field} value={field}>
                  {SORT_LABELS[field]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={sortDirection}
              onValueChange={(value) =>
                onSortDirectionChange(value as SortDirection)
              }
            >
              <DropdownMenuRadioItem value="asc">
                {a.ascending}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="desc">
                {a.descending}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {compact ? null : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 shrink-0 p-0"
          aria-pressed={showHidden}
          aria-label={
            showHidden
              ? a.hideHidden
              : hiddenCount > 0
                ? t.showHiddenCount(hiddenCount)
                : a.showHiddenAction
          }
          data-testid="fm-toggle-hidden"
          onClick={onToggleHidden}
        >
          <Icon
            name={showHidden ? "Eye" : "EyeOff"}
            className="size-4"
            aria-hidden="true"
          />
        </Button>
      )}

      {compact ? null : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 shrink-0 p-0"
          aria-label={a.collapseAll}
          data-testid="fm-collapse-all"
          disabled={expandedCount === 0}
          onClick={onCollapseAll}
        >
          <Icon name="Minimize2" className="size-4" aria-hidden="true" />
        </Button>
      )}

      {compact ? null : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 shrink-0 p-0"
          aria-label={a.refresh}
          data-testid="fm-refresh"
          onClick={onRefresh}
        >
          <Icon
            name="ArrowReloadHorizontal"
            className={cn("size-4", refreshing && "animate-spin")}
            aria-hidden="true"
          />
        </Button>
      )}

      {compact || volume === null ? null : (
        <span
          className="hidden shrink-0 text-xs tabular-nums text-muted-foreground @2xl:inline"
          title={t.freeOf(
            formatBytes(volume.freeBytes),
            formatBytes(volume.totalBytes),
          )}
        >
          {t.free(formatBytes(volume.freeBytes))}
        </span>
      )}

      {actions}
    </div>
  );
}
