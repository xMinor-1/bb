import { useEffect, useRef, useState } from "react";

import { MAX_BOOKMARK_NAME_LENGTH } from "../../contract";
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
import { Input } from "@/components/ui/input";
import { defineMessages, messagesNow, useMessages } from "../../lib/i18n";

const messages = defineMessages(
  {
    enterName: "Enter a name.",
    control: "A name cannot contain control characters.",
    tooLong: (max: number) =>
      `That name is too long (max ${String(max)} characters).`,
    title: "Rename bookmark",
    bookmarkName: "Bookmark name",
    cancel: "Cancel",
    save: "Save",
  },
  {
    enterName: "Введите имя.",
    control: "Имя не может содержать управляющие символы.",
    tooLong: (max) =>
      `Имя слишком длинное (не больше ${String(max)} символов).`,
    title: "Переименовать закладку",
    bookmarkName: "Имя закладки",
    cancel: "Отмена",
    save: "Сохранить",
  },
);

const CONTROL_CHARACTERS = /[\u0000-\u001f]/u;

export function validateBookmarkName(name: string): string | null {
  const t = messagesNow(messages);
  if (name === "") return t.enterName;
  if (CONTROL_CHARACTERS.test(name)) return t.control;
  if ([...name].length > MAX_BOOKMARK_NAME_LENGTH) {
    return t.tooLong(MAX_BOOKMARK_NAME_LENGTH);
  }
  return null;
}

export interface BookmarkNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  pathLabel: string;
  onSubmit: (name: string) => Promise<void>;
}

export function BookmarkNameDialog({
  open,
  onOpenChange,
  initialName,
  pathLabel,
  onSubmit,
}: BookmarkNameDialogProps) {
  const t = useMessages(messages);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setError(null);
    setBusy(false);
  }, [open, initialName]);

  const submit = async (): Promise<void> => {
    const trimmed = name.trim();
    const problem = validateBookmarkName(trimmed);
    if (problem !== null) {
      setError(problem);
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await onSubmit(trimmed);
      onOpenChange(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm bg-card text-card-foreground"
        data-testid="fm-bookmark-name-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription className="truncate">
            {pathLabel}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Input
            ref={inputRef}
            autoFocus
            value={name}
            aria-label={t.bookmarkName}
            aria-invalid={error !== null}
            className={cn(
              "h-9",
              error !== null && "border-surface-destructive-border",
            )}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
          />
          {error === null ? null : (
            <p role="alert" className="mt-1.5 text-xs text-destructive">
              {error}
            </p>
          )}
          <DialogFooter className="mt-4 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t.cancel}
            </Button>
            <Button
              type="submit"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={busy}
            >
              {t.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
