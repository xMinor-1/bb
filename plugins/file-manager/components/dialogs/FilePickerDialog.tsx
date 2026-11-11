import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";

import { type FileEntry } from "../../contract";
import { parseRpcError } from "../../lib/errors";
import { defineMessages, pluralRu, useMessages } from "../../lib/i18n";
import { breadcrumbs, joinPath, parentPath } from "../../lib/fm-paths";
import { formatBytes, formatModified } from "../../lib/format";
import { useFmRpc } from "../../lib/fm-rpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { effectiveKind } from "../FileRow";

const messages = defineMessages(
  {
    home: "Home",
    breadcrumb: "Breadcrumb",
    loading: "Loading…",
    cancel: "Cancel",
    addToChat: "Add to chat",
    selectAllHere: "Select every file in this folder",
    clearHere: "Clear this folder",
    selectEveryHere: "Select every file here",
    empty: "This folder is empty.",
    select: (name: string) => `Select ${name}`,
    selectedFiles: (count: number, size: string) =>
      `${String(count)} files selected — ${size}`,
  },
  {
    home: "Домашняя папка",
    breadcrumb: "Путь к папке",
    loading: "Загрузка…",
    cancel: "Отмена",
    addToChat: "Добавить в чат",
    selectAllHere: "Выбрать все файлы в этой папке",
    clearHere: "Снять выбор в этой папке",
    selectEveryHere: "Выбрать все файлы здесь",
    empty: "Папка пуста.",
    select: (name) => `Выбрать ${name}`,
    selectedFiles: (count, size) =>
      `${pluralRu(count, ["Выбран", "Выбрано", "Выбрано"])} ${String(count)} ${pluralRu(count, ["файл", "файла", "файлов"])} — ${size}`,
  },
);

export interface FilePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  root: string;
  initialPath?: string;
  confirmLabel?: string;
  onChoose: (entries: readonly FileEntry[]) => void;
}

export function FilePickerDialog({
  open,
  onOpenChange,
  title,
  description,
  root,
  initialPath,
  confirmLabel: confirmLabelProp,
  onChoose,
}: FilePickerDialogProps) {
  const t = useMessages(messages);
  const confirmLabel = confirmLabelProp ?? t.addToChat;
  const rpc = useFmRpc();
  const [path, setPath] = useState(initialPath ?? root);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selected, setSelected] = useState<Map<string, FileEntry>>(new Map());
  const [anchorPath, setAnchorPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosenRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setPath(initialPath ?? root);
    setSelected(new Map());
    setAnchorPath(null);
    setError(null);
    chosenRef.current = false;
  }, [open, initialPath, root]);

  const load = useCallback(
    async (target: string): Promise<void> => {
      setLoading(true);
      try {
        const result = await rpc.call("listDir", {
          path: target,
          showHidden: false,
        });
        setEntries(result.entries.filter((entry) => !entry.escapesRoot));
        setError(null);
      } catch (failure) {
        setError(parseRpcError(failure).message);
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [rpc],
  );

  useEffect(() => {
    if (!open) return;
    void load(path);
  }, [open, path, load]);

  const confirm = useCallback(
    (chosen: readonly FileEntry[]) => {
      if (chosenRef.current || chosen.length === 0) return;
      chosenRef.current = true;
      onChoose(chosen);
      onOpenChange(false);
    },
    [onChoose, onOpenChange],
  );

  const up = parentPath(path, root);
  const crumbs = breadcrumbs(path, root, t.home);
  const folders = entries.filter(
    (entry) => effectiveKind(entry) === "directory",
  );
  const files = entries.filter((entry) => effectiveKind(entry) === "file");

  const selectedList = useMemo(() => [...selected.values()], [selected]);
  const selectedBytes = selectedList.reduce(
    (total, entry) => total + entry.sizeBytes,
    0,
  );
  const selectedHere = files.filter((file) => selected.has(file.path)).length;
  const allHereSelected = files.length > 0 && selectedHere === files.length;

  const toggleRow = useCallback(
    (file: FileEntry, event?: MouseEvent) => {
      const shift = event?.shiftKey === true;
      setSelected((previous) => {
        const next = new Map(previous);
        if (shift && anchorPath !== null) {
          const from = files.findIndex(
            (candidate) => candidate.path === anchorPath,
          );
          const to = files.findIndex(
            (candidate) => candidate.path === file.path,
          );
          if (from !== -1 && to !== -1) {
            const [start, end] = from <= to ? [from, to] : [to, from];
            for (const entry of files.slice(start, end + 1))
              next.set(entry.path, entry);
            return next;
          }
        }
        if (next.has(file.path)) next.delete(file.path);
        else next.set(file.path, file);
        return next;
      });
      setAnchorPath(file.path);
    },
    [anchorPath, files],
  );

  const toggleAllHere = useCallback(() => {
    setSelected((previous) => {
      const next = new Map(previous);
      if (files.every((file) => next.has(file.path))) {
        for (const file of files) next.delete(file.path);
      } else {
        for (const file of files) next.set(file.path, file);
      }
      return next;
    });
    setAnchorPath(null);
  }, [files]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md bg-card text-card-foreground"
        data-testid="fm-file-picker"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description === undefined ? null : (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>

        <nav
          aria-label={t.breadcrumb}
          className="flex items-center gap-0.5 overflow-x-auto"
        >
          {crumbs.map((crumb, index) => (
            <div
              key={crumb.path}
              className="flex shrink-0 items-center gap-0.5"
            >
              {index === 0 ? null : (
                <Icon
                  name="ChevronRight"
                  className="size-3 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
              <button
                type="button"
                className="rounded-md px-1 py-0.5 text-xs text-muted-foreground hover:bg-state-hover hover:text-foreground"
                onClick={() => setPath(crumb.path)}
              >
                {crumb.name}
              </button>
            </div>
          ))}
        </nav>

        {files.length === 0 ? null : (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={allHereSelected}
              aria-label={t.selectAllHere}
              data-testid="fm-picker-select-all"
              onCheckedChange={toggleAllHere}
            />
            {allHereSelected ? t.clearHere : t.selectEveryHere}
          </label>
        )}

        <div className="h-56 overflow-y-auto rounded-md border border-border bg-surface-recessed">
          {up === null ? null : (
            <button
              type="button"
              className="flex h-9 w-full items-center gap-2 px-3 text-sm text-muted-foreground hover:bg-state-hover"
              onClick={() => setPath(up)}
            >
              <Icon name="FolderOpen" className="size-4" aria-hidden="true" />
              ..
            </button>
          )}
          {loading && entries.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {t.loading}
            </p>
          ) : null}
          {error !== null ? (
            <p role="alert" className="px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
          {!loading && error === null && entries.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">{t.empty}</p>
          ) : null}

          {folders.map((folder) => (
            <button
              key={folder.path}
              type="button"
              data-testid="fm-picker-folder"
              className="flex h-9 w-full items-center gap-2 px-3 text-left text-sm hover:bg-state-hover"
              onClick={() => setPath(joinPath(path, folder.name))}
            >
              <Icon
                name="Folder"
                className="size-4 shrink-0"
                aria-hidden="true"
              />
              <span className="truncate">{folder.name}</span>
            </button>
          ))}

          {files.map((file) => {
            const isSelected = selected.has(file.path);
            return (
              <div
                key={file.path}
                data-testid="fm-picker-file"
                data-selected={isSelected ? "true" : undefined}
                className={cn(
                  "flex h-9 w-full items-center gap-2 px-3 text-left text-sm hover:bg-state-hover",
                  isSelected && "bg-surface-selected hover:bg-surface-selected",
                )}
              >
                {}
                <Checkbox
                  checked={isSelected}
                  aria-label={t.select(file.name)}
                  data-testid="fm-picker-check"
                  onClick={(event) => toggleRow(file, event)}
                  onCheckedChange={() => undefined}
                />
                <button
                  type="button"
                  aria-pressed={isSelected}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={(event) => toggleRow(file, event)}
                  onDoubleClick={() => {
                    const chosen = new Map(selected);
                    chosen.set(file.path, file);
                    confirm([...chosen.values()]);
                  }}
                >
                  <Icon
                    name="File"
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="truncate">{file.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {formatBytes(file.sizeBytes)}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        {}
        <p
          className="truncate text-xs text-muted-foreground"
          data-testid="fm-picker-summary"
          title={selectedList.map((entry) => entry.path).join("\n") || path}
        >
          {selectedList.length === 0
            ? path
            : selectedList.length === 1 && selectedList[0] !== undefined
              ? `${selectedList[0].name} — ${formatBytes(selectedList[0].sizeBytes)}, ${formatModified(selectedList[0].modifiedAtMs)}`
              : t.selectedFiles(
                  selectedList.length,
                  formatBytes(selectedBytes),
                )}
        </p>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t.cancel}
          </Button>
          <Button
            type="button"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={selectedList.length === 0}
            data-testid="fm-picker-confirm"
            onClick={() => confirm(selectedList)}
          >
            {selectedList.length > 1
              ? `${confirmLabel} (${String(selectedList.length)})`
              : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
