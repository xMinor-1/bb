import { useLayoutEffect, useRef, useState, type DragEvent } from "react";

import { cn } from "@/lib/utils";
import { Breadcrumbs } from "./Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { defineMessages, useMessages } from "../lib/i18n";

const messages = defineMessages(
  {
    editPathHint: "Edit path (Ctrl+L)",
    editPath: "Edit path",
    folderPath: "Folder path",
    help: "Type or paste a path and press Enter. Escape cancels.",
  },
  {
    editPathHint: "Изменить путь (Ctrl+L)",
    editPath: "Изменить путь",
    folderPath: "Путь к папке",
    help: "Введите или вставьте путь и нажмите Enter. Escape — отмена.",
  },
);

export interface PathBarProps {
  path: string;
  root: string;
  onNavigate: (path: string) => void;
  editing: boolean;
  onOpen: () => void;
  onCancel: (options: { focusGrid: boolean }) => void;
  onSubmit: (raw: string) => void;
  error: string | null;
  onDirty: () => void;
  busy?: boolean;
  focusTick: number;
  dropTargetPath?: string | null;
  onDragOverCrumb?: (path: string, event: DragEvent<HTMLElement>) => void;
  onDragLeaveCrumb?: (path: string, event: DragEvent<HTMLElement>) => void;
  onDropOnCrumb?: (path: string, event: DragEvent<HTMLElement>) => void;
}

export function PathBar({
  path,
  root,
  onNavigate,
  editing,
  onOpen,
  onCancel,
  onSubmit,
  error,
  onDirty,
  busy = false,
  focusTick,
  dropTargetPath = null,
  onDragOverCrumb,
  onDragLeaveCrumb,
  onDropOnCrumb,
}: PathBarProps) {
  const t = useMessages(messages);
  return (
    <div
      className="relative flex min-w-0 flex-1 items-center gap-1"
      data-testid="fm-path-bar"
      title={path}
    >
      {editing ? (
        <PathEditor
          key="editor"
          initialValue={path}
          busy={busy}
          invalid={error !== null}
          focusTick={focusTick}
          onSubmit={onSubmit}
          onCancel={onCancel}
          onDirty={onDirty}
        />
      ) : (
        <Breadcrumbs
          path={path}
          root={root}
          onNavigate={onNavigate}
          dropTargetPath={dropTargetPath}
          onDragOverTarget={onDragOverCrumb}
          onDragLeaveTarget={onDragLeaveCrumb}
          onDropOnTarget={onDropOnCrumb}
          onEmptyAreaClick={onOpen}
          className="cursor-text"
        />
      )}

      {}
      <span className="shrink-0" title={t.editPathHint}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 shrink-0 p-0"
          aria-label={t.editPath}
          aria-pressed={editing}
          data-testid="fm-path-edit"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (editing) onCancel({ focusGrid: true });
            else onOpen();
          }}
        >
          <Icon name="Edit" className="size-4" aria-hidden="true" />
        </Button>
      </span>

      {error === null ? null : (
        <p
          id="fm-path-error"
          role="alert"
          data-testid="fm-path-error"
          className="absolute left-0 top-full z-20 mt-1 max-w-full break-words rounded-md border border-destructive/40 bg-popover px-2 py-1 text-xs text-destructive shadow-md"
        >
          {error}
        </p>
      )}
    </div>
  );
}

interface PathEditorProps {
  initialValue: string;
  busy: boolean;
  invalid: boolean;
  focusTick: number;
  onSubmit: (raw: string) => void;
  onCancel: (options: { focusGrid: boolean }) => void;
  onDirty: () => void;
}

function PathEditor({
  initialValue,
  busy,
  invalid,
  focusTick,
  onSubmit,
  onCancel,
  onDirty,
}: PathEditorProps) {
  const t = useMessages(messages);
  const [value, setValue] = useState(initialValue);
  const localRef = useRef<HTMLInputElement | null>(null);

  useLayoutEffect(() => {
    const input = localRef.current;
    if (input === null) return;
    input.focus();
    input.select();
  }, [focusTick]);

  return (
    <div
      role="group"
      aria-label={t.folderPath}
      aria-busy={busy}
      className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-input px-2"
      data-testid="fm-path-group"
    >
      <Icon
        name="Folder"
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        ref={localRef}
        id="fm-path-input"
        type="text"
        value={value}
        aria-label={t.folderPath}
        aria-describedby="fm-path-hint"
        aria-invalid={invalid || undefined}
        aria-errormessage={invalid ? "fm-path-error" : undefined}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        enterKeyHint="go"
        data-testid="fm-path-input"
        className={cn(
          "h-7 flex-1 border-0 bg-transparent px-0 font-mono text-sm focus-visible:ring-0",
          invalid && "text-destructive",
        )}
        onChange={(event) => {
          setValue(event.target.value);
          onDirty();
        }}
        onKeyDown={(event) => {
          if (
            (event.nativeEvent as KeyboardEvent).isComposing ||
            event.keyCode === 229
          )
            return;
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit(event.currentTarget.value);
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onCancel({ focusGrid: true });
          }
        }}
        onBlur={() => {
          onCancel({ focusGrid: false });
        }}
      />
      <span id="fm-path-hint" className="sr-only">
        {t.help}
      </span>
    </div>
  );
}
