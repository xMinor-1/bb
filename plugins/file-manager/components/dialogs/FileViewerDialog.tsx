import { useEffect, useState } from "react";
import {
  Markdown,
  experimental_SourceCode as SourceCode,
} from "@get-bb/plugin-sdk/app";

import type { FileEntry } from "../../contract";
import { downloadEntry } from "../../lib/download";
import { parseRpcError } from "../../lib/errors";
import { dirname } from "../../lib/fm-paths";
import { formatBytes } from "../../lib/format";
import { useFmRpc, type RpcOutput } from "../../lib/fm-rpc";
import { previewUrl } from "../../lib/preview";
import {
  isTextViewerKind,
  isUrlViewerKind,
  viewerKindForEntry,
} from "../../lib/viewer";
import { usePreviewBase } from "../../hooks/usePreviewBase";
import { ArchiveContents } from "../ArchiveContents";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { defineMessages, useMessages } from "../../lib/i18n";

const messages = defineMessages(
  {
    mediaFailedTitle: "This file could not be displayed",
    mediaFailedBody:
      "The browser refused to play or paint it. Downloading it still works.",
    loading: "Loading…",
    reading: "Reading…",
    noPreviewTitle: "No preview for this kind of file",
    noPreviewBody:
      "It is not text, and not an image, PDF or media file a browser can show.",
    readFailed: "Could not read this file",
    showingFirst: (size: string) => `· showing the first ${size}`,
    source: "Source",
    rendered: "Rendered",
    download: "Download",
  },
  {
    mediaFailedTitle: "Не удалось показать этот файл",
    mediaFailedBody:
      "Браузер не смог его воспроизвести или отрисовать. Скачать файл всё равно можно.",
    loading: "Загрузка…",
    reading: "Читаю…",
    noPreviewTitle: "Для такого файла нет просмотра",
    noPreviewBody:
      "Это не текст и не картинка, PDF или медиафайл, которые умеет показывать браузер.",
    readFailed: "Не удалось прочитать файл",
    showingFirst: (size) => `— показаны первые ${size}`,
    source: "Исходник",
    rendered: "Просмотр",
    download: "Скачать",
  },
);

type TextState =
  | { status: "loading" }
  | { status: "ready"; result: RpcOutput<"readTextFile"> }
  | { status: "unsupported" }
  | { status: "failed"; message: string };

export interface FileViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: FileEntry;
  onExtract?: ((entry: FileEntry) => void) | undefined;
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
      <div className="max-w-md space-y-2">{children}</div>
    </div>
  );
}

function TextBody({
  entry,
  result,
  rendered,
}: {
  entry: FileEntry;
  result: RpcOutput<"readTextFile">;
  rendered: boolean;
}) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-auto"
      data-testid="fm-viewer-text"
    >
      {rendered ? (
        <Markdown content={result.text} className="p-4" />
      ) : (
        <SourceCode
          content={result.text}
          path={entry.name}
          className="min-h-0 flex-1"
        />
      )}
    </div>
  );
}

export function FileViewerDialog({
  open,
  onOpenChange,
  entry,
  onExtract,
}: FileViewerDialogProps) {
  const t = useMessages(messages);
  const rpc = useFmRpc();
  const kind = viewerKindForEntry(entry);
  const wantsUrl = isUrlViewerKind(kind);
  const wantsText = isTextViewerKind(kind);

  const baseUrl = usePreviewBase({
    path: dirname(entry.path),
    enabled: open && wantsUrl,
  });
  const url = baseUrl === null ? null : previewUrl(baseUrl, entry.name);

  const [text, setText] = useState<TextState>({ status: "loading" });
  const [rendered, setRendered] = useState(true);
  const [mediaFailed, setMediaFailed] = useState(false);

  useEffect(() => {
    setRendered(true);
    setMediaFailed(false);
  }, [entry.path]);

  useEffect(() => {
    if (!open || !wantsText) return;
    let cancelled = false;
    setText({ status: "loading" });
    void (async () => {
      try {
        const result = await rpc.call("readTextFile", { path: entry.path });
        if (!cancelled) setText({ status: "ready", result });
      } catch (failure) {
        if (cancelled) return;
        const parsed = parseRpcError(failure);
        setText(
          parsed.code === "unsupported"
            ? { status: "unsupported" }
            : { status: "failed", message: parsed.rawMessage },
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entry.path, open, rpc, wantsText]);

  const download = (): void => {
    downloadEntry(entry);
  };

  let body: React.ReactNode;
  if (kind === "archive") {
    body = (
      <ArchiveContents
        path={entry.path}
        onExtract={onExtract === undefined ? undefined : () => onExtract(entry)}
      />
    );
  } else if (wantsUrl && mediaFailed) {
    body = (
      <Placeholder>
        <p className="font-medium text-foreground">{t.mediaFailedTitle}</p>
        <p>{t.mediaFailedBody}</p>
      </Placeholder>
    );
  } else if (wantsUrl && url === null) {
    body = <Placeholder>{t.loading}</Placeholder>;
  } else if (kind === "image" && url !== null) {
    body = (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
        <img
          src={url}
          alt={entry.name}
          data-testid="fm-viewer-image"
          className="max-h-full max-w-full object-contain"
          onError={() => setMediaFailed(true)}
        />
      </div>
    );
  } else if (kind === "pdf" && url !== null) {
    body = (
      <iframe
        src={url}
        title={entry.name}
        data-testid="fm-viewer-pdf"
        className="min-h-0 w-full flex-1 border-0 bg-background"
      />
    );
  } else if (kind === "video" && url !== null) {
    body = (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- a file on
            disk carries no track we could offer. */}
        <video
          src={url}
          controls
          data-testid="fm-viewer-video"
          className="max-h-full max-w-full"
          onError={() => setMediaFailed(true)}
        />
      </div>
    );
  } else if (kind === "audio" && url !== null) {
    body = (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- as above. */}
        <audio
          src={url}
          controls
          data-testid="fm-viewer-audio"
          className="w-full max-w-lg"
          onError={() => setMediaFailed(true)}
        />
      </div>
    );
  } else if (text.status === "loading") {
    body = <Placeholder>{t.reading}</Placeholder>;
  } else if (text.status === "unsupported") {
    body = (
      <Placeholder>
        <p className="font-medium text-foreground">{t.noPreviewTitle}</p>
        <p>{t.noPreviewBody}</p>
      </Placeholder>
    );
  } else if (text.status === "failed") {
    body = (
      <Placeholder>
        <p className="font-medium text-foreground">{t.readFailed}</p>
        <p>{text.message}</p>
      </Placeholder>
    );
  } else {
    body = (
      <TextBody
        entry={entry}
        result={text.result}
        rendered={kind === "markdown" && rendered}
      />
    );
  }

  const truncated = text.status === "ready" && text.result.truncated;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="fm-viewer"
        className="flex h-[85vh] max-h-[85vh] w-[min(72rem,95vw)] max-w-[min(72rem,95vw)] flex-col gap-0 overflow-hidden p-0"
      >
        {}
        <DialogHeader className="shrink-0 gap-0 border-b border-border px-4 py-3 pr-10">
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <DialogTitle className="truncate" title={entry.path}>
                {entry.name}
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-x-2">
                <span>{formatBytes(entry.sizeBytes)}</span>
                {truncated ? (
                  <span data-testid="fm-viewer-truncated">
                    {t.showingFirst(
                      formatBytes(
                        text.status === "ready" ? text.result.readBytes : 0,
                      ),
                    )}
                  </span>
                ) : null}
              </DialogDescription>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {kind === "markdown" && text.status === "ready" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1.5 px-2 text-xs"
                  data-testid="fm-viewer-toggle-source"
                  onClick={() => setRendered((value) => !value)}
                >
                  <Icon
                    name={rendered ? "Code" : "AlignLeft"}
                    className="size-4"
                    aria-hidden
                  />
                  <span className="hidden sm:inline">
                    {rendered ? t.source : t.rendered}
                  </span>
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 px-2 text-xs"
                data-testid="fm-viewer-download"
                onClick={download}
              >
                <Icon name="Download" className="size-4" aria-hidden />
                <span className="hidden sm:inline">{t.download}</span>
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {body}
        </div>
      </DialogContent>
    </Dialog>
  );
}
