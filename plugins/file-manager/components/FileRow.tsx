import { memo, type DragEvent, type MouseEvent } from "react";

import type { FileEntry } from "../contract";
import { cn } from "@/lib/utils";
import {
  formatBytes,
  formatDateTime,
  formatExactBytes,
  formatModified,
} from "../lib/format";
import { rootPhrase } from "../lib/fm-paths";
import {
  INDENT_STEP_PX,
  MAX_INDENT_DEPTH,
  MAX_TREE_ROWS,
} from "../lib/fm-tree";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon, type IconName } from "@/components/ui/icon";
import { CONTROL_HOVER_TRANSITION } from "@/components/ui/motion";
import { TableCell, TableRow } from "@/components/ui/table";
import { defineMessages, useMessages } from "../lib/i18n";

const messages = defineMessages(
  {
    outside: (name: string, root: string) => `${name} → outside ${root}`,
    truncated: (name: string, count: number) =>
      `${name} — showing the first ${String(count)} items`,
    select: (name: string) => `Select ${name}`,
    collapse: (name: string) => `Collapse ${name}`,
    expand: (name: string) => `Expand ${name}`,
    symlink: "Symbolic link",
  },
  {
    outside: (name, root) => `${name} → вне ${root}`,
    truncated: (name, count) => `${name} — показаны первые ${String(count)}`,
    select: (name) => `Выбрать ${name}`,
    collapse: (name) => `Свернуть ${name}`,
    expand: (name) => `Развернуть ${name}`,
    symlink: "Символическая ссылка",
  },
);

export function effectiveKind(entry: FileEntry): FileEntry["kind"] {
  if (entry.isSymlink && entry.targetKind !== null) return entry.targetKind;
  return entry.kind;
}

export function isDirectoryEntry(entry: FileEntry): boolean {
  return !entry.escapesRoot && effectiveKind(entry) === "directory";
}

export function isFileEntry(entry: FileEntry): boolean {
  return !entry.escapesRoot && effectiveKind(entry) === "file";
}

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "yaml",
  "yml",
  "toml",
  "ini",
  "conf",
  "cfg",
  "log",
  "csv",
  "tsv",
  "xml",
  "html",
  "css",
  "js",
  "jsx",
  "ts",
  "tsx",
  "py",
  "rs",
  "go",
  "rb",
  "sh",
  "bash",
  "zsh",
  "sql",
  "env",
]);

export function entryIconName(entry: FileEntry): IconName {
  if (entry.escapesRoot) return "ExternalLink";
  if (entry.archiveFormat !== null) return "Archive";
  const kind = effectiveKind(entry);
  if (kind === "directory") return "Folder";
  if (kind === "other") return "File";
  const dot = entry.name.lastIndexOf(".");
  const extension = dot > 0 ? entry.name.slice(dot + 1).toLowerCase() : "";
  return TEXT_EXTENSIONS.has(extension) ? "FileText" : "File";
}

export function rowDomId(path: string): string {
  return `fm-row:${path}`;
}

export interface FileRowProps {
  entry: FileEntry;
  dragEnabled: boolean;
  depth: number;
  expandable: boolean;
  expanded: boolean;
  loadingChildren: boolean;
  childrenTruncated: boolean;
  onToggleExpand: (entry: FileEntry) => void;
  selected: boolean;
  focused: boolean;
  cut: boolean;
  dropTarget: boolean;
  nowMs: number;
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

function FileRowImpl({
  entry,
  dragEnabled,
  depth,
  expandable,
  expanded,
  loadingChildren,
  childrenTruncated,
  onToggleExpand,
  selected,
  focused,
  cut,
  dropTarget,
  nowMs,
  onRowClick,
  onRowDoubleClick,
  onRowContextMenu,
  onToggleSelect,
  onRowDragStart,
  onRowDragOver,
  onRowDragLeave,
  onRowDrop,
  onRowDragEnd,
}: FileRowProps) {
  const t = useMessages(messages);
  const directory = isDirectoryEntry(entry);
  const size = directory ? "—" : formatBytes(entry.sizeBytes);
  const indentPx = Math.min(depth, MAX_INDENT_DEPTH) * INDENT_STEP_PX;

  const title = entry.escapesRoot
    ? t.outside(entry.name, rootPhrase())
    : childrenTruncated
      ? t.truncated(entry.name, MAX_TREE_ROWS)
      : entry.name;

  return (
    <TableRow
      role="row"
      id={rowDomId(entry.path)}
      aria-selected={selected}
      aria-level={depth + 1}
      aria-expanded={expandable ? expanded : undefined}
      data-testid="fm-row"
      data-fm-path={entry.path}
      data-fm-depth={String(depth)}
      data-selected={selected ? "true" : undefined}
      data-drop-target={dropTarget ? "true" : undefined}
      tabIndex={-1}
      draggable={dragEnabled}
      title={title}
      className={cn(
        "h-9 border-b border-border-hairline text-sm select-none",
        "hover:bg-state-hover active:bg-state-active",
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
      <TableCell
        className="w-8 py-0 pl-3 pr-0"
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
      </TableCell>

      <TableCell className="min-w-0 py-0">
        <div
          className="flex min-w-0 items-center gap-2"
          style={indentPx === 0 ? undefined : { paddingInlineStart: indentPx }}
        >
          {expandable ? (
            <button
              type="button"
              tabIndex={-1}
              data-testid="fm-chevron"
              data-fm-chevron={entry.path}
              aria-expanded={expanded}
              aria-label={
                expanded ? t.collapse(entry.name) : t.expand(entry.name)
              }
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground",
                "hover:bg-state-hover hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "max-md:pointer-coarse:size-5",
                CONTROL_HOVER_TRANSITION,
              )}
              onMouseDown={(event) => event.stopPropagation()}
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggleExpand(entry);
              }}
            >
              <Icon
                name={loadingChildren ? "Loading" : "ChevronRight"}
                className={cn(
                  "size-3.5 transition-transform duration-150",
                  loadingChildren && "animate-spin",
                  !loadingChildren && expanded && "rotate-90",
                )}
                aria-hidden="true"
              />
            </button>
          ) : (
            <span
              data-fm-chevron-spacer=""
              className="size-4 shrink-0 max-md:pointer-coarse:size-5"
              aria-hidden="true"
            />
          )}
          <Icon
            name={entryIconName(entry)}
            className={cn(
              "size-4 shrink-0",
              directory ? "text-foreground" : "text-muted-foreground",
            )}
            aria-hidden="true"
          />
          <span className="truncate">{entry.name}</span>
          {entry.isSymlink ? (
            <Icon
              name="ExternalLink"
              className="size-3 shrink-0 text-muted-foreground"
              aria-label={t.symlink}
            />
          ) : null}
        </div>
      </TableCell>

      <TableCell
        className="hidden w-24 py-0 text-right text-xs tabular-nums text-muted-foreground @md:table-cell"
        title={directory ? undefined : formatExactBytes(entry.sizeBytes)}
      >
        {size}
      </TableCell>

      <TableCell
        className="hidden w-32 py-0 text-xs tabular-nums text-muted-foreground @md:table-cell"
        title={formatDateTime(entry.modifiedAtMs)}
      >
        {formatModified(entry.modifiedAtMs, nowMs)}
      </TableCell>
    </TableRow>
  );
}

export const FileRow = memo(FileRowImpl);
