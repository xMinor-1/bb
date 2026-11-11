import { useCallback, useEffect, useRef, useState } from "react";

import { type FileEntry } from "../../contract";
import { parseRpcError } from "../../lib/errors";
import { defineMessages, useMessages } from "../../lib/i18n";
import {
  breadcrumbs,
  getClientRoot,
  joinPath,
  parentPath,
} from "../../lib/fm-paths";
import { useFmRpc } from "../../lib/fm-rpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
    chooseFolder: "Choose this folder",
    noSubfolders: "No sub-folders here.",
  },
  {
    home: "Домашняя папка",
    breadcrumb: "Путь к папке",
    loading: "Загрузка…",
    cancel: "Отмена",
    chooseFolder: "Выбрать эту папку",
    noSubfolders: "Вложенных папок нет.",
  },
);

export interface FolderPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  initialPath?: string;
  root?: string;
  showHidden?: boolean;
  disabledPaths?: ReadonlySet<string>;
  confirmLabel?: string;
  onChoose: (path: string) => void;
}

export function FolderPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  initialPath,
  root = getClientRoot(),
  showHidden = false,
  disabledPaths,
  confirmLabel,
  onChoose,
}: FolderPickerDialogProps) {
  const t = useMessages(messages);
  const rpc = useFmRpc();
  const [path, setPath] = useState(initialPath ?? root);
  const [folders, setFolders] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosenRef = useRef(false);

  useEffect(() => {
    if (open) {
      setPath(initialPath ?? root);
      setError(null);
      chosenRef.current = false;
    }
  }, [open, initialPath, root]);

  const load = useCallback(
    async (target: string): Promise<void> => {
      setLoading(true);
      try {
        const result = await rpc.call("listDir", { path: target, showHidden });
        setFolders(
          result.entries.filter(
            (entry) =>
              effectiveKind(entry) === "directory" && !entry.escapesRoot,
          ),
        );
        setError(null);
      } catch (failure) {
        setError(parseRpcError(failure).message);
        setFolders([]);
      } finally {
        setLoading(false);
      }
    },
    [rpc, showHidden],
  );

  useEffect(() => {
    if (!open) return;
    void load(path);
  }, [open, path, load]);

  const up = parentPath(path, root);
  const crumbs = breadcrumbs(path, root, t.home);
  const disabled = disabledPaths?.has(path) === true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md bg-card text-card-foreground"
        data-testid="fm-folder-picker"
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
          {loading && folders.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {t.loading}
            </p>
          ) : null}
          {error !== null ? (
            <p role="alert" className="px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
          {!loading && error === null && folders.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {t.noSubfolders}
            </p>
          ) : null}
          {folders.map((folder) => {
            const blocked = disabledPaths?.has(folder.path) === true;
            return (
              <button
                key={folder.path}
                type="button"
                data-testid="fm-picker-folder"
                disabled={blocked}
                className={cn(
                  "flex h-9 w-full items-center gap-2 px-3 text-left text-sm hover:bg-state-hover",
                  blocked &&
                    "cursor-not-allowed opacity-40 hover:bg-transparent",
                )}
                onClick={() => setPath(joinPath(path, folder.name))}
              >
                <Icon
                  name="Folder"
                  className="size-4 shrink-0"
                  aria-hidden="true"
                />
                <span className="truncate">{folder.name}</span>
              </button>
            );
          })}
        </div>

        <p className="truncate text-xs text-muted-foreground" title={path}>
          {path}
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
            disabled={disabled}
            onClick={() => {
              if (chosenRef.current) return;
              chosenRef.current = true;
              onChoose(path);
              onOpenChange(false);
            }}
          >
            {confirmLabel ?? t.chooseFolder}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
