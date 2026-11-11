import { useCallback, useEffect, useState } from "react";
import { useComposer } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";

import type { FileEntry } from "../contract";
import {
  composerScopeKey,
  subscribeFilePickRequests,
} from "../lib/composer-bus";
import { addFileMentions } from "../lib/composer-mentions";
import { errorToastText } from "../lib/errors";
import { useFmRpc } from "../lib/fm-rpc";
import { FilePickerDialog } from "./dialogs/FilePickerDialog";
import {
  defineMessages,
  messagesNow,
  pluralRu,
  useMessages,
} from "../lib/i18n";

const messages = defineMessages(
  {
    unreachable: "Could not reach the File Manager.",
    added: (name: string) => `${name} added to the chat`,
    filesAdded: (count: number) => `${String(count)} files added to the chat`,
    title: "Add a file from this machine",
    description:
      "Files on the machine bb runs on. The agent reads the file when you send the message.",
  },
  {
    unreachable: "Файловый менеджер не отвечает.",
    added: (name) => `${name} добавлен в чат`,
    filesAdded: (count) =>
      `${String(count)} ${pluralRu(count, ["файл добавлен", "файла добавлены", "файлов добавлено"])} в чат`,
    title: "Добавить файл с этой машины",
    description:
      "Файлы с машины, на которой работает bb. Агент прочитает файл, когда вы отправите сообщение.",
  },
);

interface PickerRoots {
  root: string;
  startFolder: string;
}

export function ComposerFilePicker() {
  const t = useMessages(messages);
  const rpc = useFmRpc();
  const composer = useComposer();
  const scopeKey = composerScopeKey(composer.scope);
  const [open, setOpen] = useState(false);
  const [roots, setRoots] = useState<PickerRoots | null>(null);

  useEffect(
    () =>
      subscribeFilePickRequests((requested) => {
        if (requested === scopeKey) setOpen(true);
      }),
    [scopeKey],
  );

  useEffect(() => {
    if (!open || roots !== null) return;
    let cancelled = false;
    void (async () => {
      try {
        const state = await rpc.call("getState", null);
        if (!cancelled)
          setRoots({ root: state.root, startFolder: state.startFolder });
      } catch (failure) {
        if (cancelled) return;
        setOpen(false);
        toast.error(errorToastText(failure, messagesNow(messages).unreachable));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, roots, rpc]);

  const choose = useCallback(
    (entries: readonly FileEntry[]) => {
      addFileMentions(composer, entries);
      const first = entries[0];
      if (first === undefined) return;
      toast.success(
        entries.length === 1
          ? messagesNow(messages).added(first.name)
          : messagesNow(messages).filesAdded(entries.length),
      );
    },
    [composer],
  );

  if (roots === null) return null;

  return (
    <FilePickerDialog
      open={open}
      onOpenChange={setOpen}
      title={t.title}
      description={t.description}
      root={roots.root}
      initialPath={roots.startFolder}
      onChoose={choose}
    />
  );
}
