import type { ReactNode } from "react";

import type { ViewMode } from "../contract";
import type { SortDirection, SortField } from "../hooks/useDirectory";
import type { PanelCommand } from "./panel-bus";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { actionMessages, sortLabels, viewLabels } from "./action-messages";
import { LanguageSwitch, useMessages } from "../lib/i18n";

export interface ThreadFolderAction {
  available: boolean;
  blockedReason: string | null;
  onOpen: () => void;
}

export interface PanelActionsProps {
  ready: boolean;
  writable: boolean;
  canPaste: boolean;
  showHidden: boolean;
  sortField: SortField;
  sortDirection: SortDirection;
  viewMode: ViewMode;
  expandedCount: number;
  bookmarks?: ReactNode;
  onCommand: (command: PanelCommand) => void;
  onSortFieldChange: (field: SortField) => void;
  onSortDirectionChange: (direction: SortDirection) => void;
  threadFolder?: ThreadFolderAction | null;
  onViewModeChange: (mode: ViewMode) => void;
}

export function PanelActions({
  ready,
  writable,
  canPaste,
  showHidden,
  sortField,
  sortDirection,
  viewMode,
  expandedCount,
  bookmarks,
  onCommand,
  onSortFieldChange,
  onSortDirectionChange,
  threadFolder = null,
  onViewModeChange,
}: PanelActionsProps) {
  const t = useMessages(actionMessages);
  const SORT_LABELS: Record<SortField, string> = sortLabels(t);
  const VIEW_LABELS: Record<ViewMode, string> = viewLabels(t);
  const mutationsDisabled = !ready || !writable;
  const blockedReason = threadFolder?.blockedReason ?? null;

  return (
    <div
      className="flex shrink-0 items-center gap-1"
      data-testid="fm-panel-actions"
    >
      {threadFolder?.available === true ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 shrink-0 p-0"
          aria-label={t.openThreadFolder}
          data-testid="fm-panel-thread-folder"
          onClick={threadFolder.onOpen}
        >
          <Icon name="FolderGit" className="size-4" aria-hidden="true" />
        </Button>
      ) : null}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 shrink-0 p-0"
        disabled={mutationsDisabled}
        aria-label={t.uploadFilesButton}
        data-testid="fm-panel-upload"
        onClick={() => onCommand({ type: "upload" })}
      >
        <Icon name="PackageReceive" className="size-4" aria-hidden="true" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 shrink-0 p-0"
        disabled={mutationsDisabled}
        aria-label={t.newFolder}
        data-testid="fm-panel-new-folder"
        onClick={() => onCommand({ type: "new-folder" })}
      >
        <Icon name="FolderPlus" className="size-4" aria-hidden="true" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 shrink-0 p-0"
            aria-label={t.moreActions}
            data-testid="fm-panel-overflow"
          >
            <Icon name="MoreHorizontal" className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="max-h-96 w-56 overflow-y-auto"
        >
          {blockedReason === null ? null : (
            <>
              <DropdownMenuItem
                disabled
                data-testid="fm-panel-thread-folder-blocked"
              >
                <Icon name="FolderGit" className="size-4" aria-hidden="true" />
                {blockedReason}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {bookmarks === undefined ? null : (
            <>
              {bookmarks}
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem
            disabled={!ready}
            data-testid="fm-panel-refresh"
            onSelect={() => onCommand({ type: "refresh" })}
          >
            <Icon
              name="ArrowReloadHorizontal"
              className="size-4"
              aria-hidden="true"
            />
            {t.refresh}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!ready}
            data-testid="fm-panel-toggle-hidden"
            onSelect={() => onCommand({ type: "toggle-hidden" })}
          >
            <Icon
              name={showHidden ? "EyeOff" : "Eye"}
              className="size-4"
              aria-hidden="true"
            />
            {showHidden ? t.hideHidden : t.showHiddenAction}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={expandedCount === 0}
            data-testid="fm-panel-collapse-all"
            onSelect={() => onCommand({ type: "collapse-all" })}
          >
            <Icon name="Minimize2" className="size-4" aria-hidden="true" />
            {t.collapseAll}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!ready}
            data-testid="fm-panel-select-all"
            onSelect={() => onCommand({ type: "select-all" })}
          >
            <Icon name="Check" className="size-4" aria-hidden="true" />
            {t.selectAll}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            disabled={!canPaste || mutationsDisabled}
            data-testid="fm-panel-paste"
            onSelect={() => onCommand({ type: "paste" })}
          >
            <Icon name="Copy" className="size-4" aria-hidden="true" />
            {t.paste}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!ready}
            data-testid="fm-panel-copy-path"
            onSelect={() => onCommand({ type: "copy-path" })}
          >
            <Icon name="Paperclip" className="size-4" aria-hidden="true" />
            {t.copyFolderPath}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!ready}
            data-testid="fm-panel-set-start-folder"
            onSelect={() => onCommand({ type: "set-start-folder" })}
          >
            <Icon name="Pin" className="size-4" aria-hidden="true" />
            {t.setStartFolder}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {}
          <DropdownMenuLabel>{t.view}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={viewMode}
            onValueChange={(value) => onViewModeChange(value as ViewMode)}
          >
            {(Object.keys(VIEW_LABELS) as ViewMode[]).map((mode) => (
              <DropdownMenuRadioItem
                key={mode}
                value={mode}
                data-testid={`fm-panel-view-${mode}`}
              >
                {VIEW_LABELS[mode]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />

          <DropdownMenuLabel>{t.sortBy}</DropdownMenuLabel>
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
              {t.ascending}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="desc">
              {t.descending}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>

          {}
          <DropdownMenuSeparator />
          <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
            <span className="text-muted-foreground">{t.language}</span>
            <LanguageSwitch />
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
