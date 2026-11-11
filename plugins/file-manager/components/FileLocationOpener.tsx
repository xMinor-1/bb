import { useEffect, useRef, useState } from "react";
import type { PluginFileOpenerProps } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";

import { detectArchiveFormat } from "../contract";
import { useLocalLocation } from "../hooks/useFmLocation";
import { parseRpcError } from "../lib/errors";
import { basename } from "../lib/fm-paths";
import { useFmRpc, type RpcOutput } from "../lib/fm-rpc";
import { ArchiveContents } from "./ArchiveContents";
import { FileManagerSurface } from "./FileManagerPanel";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { defineMessages, messagesNow, useMessages } from "../lib/i18n";

const messages = defineMessages(
  {
    notThere: (name: string, dir: string) =>
      `${name} is not there. Opened ${dir} instead.`,
    findingFile: "Finding this file…",
    locationFailed: "Could not open this location",
    findingArchive: "Finding this archive…",
    archiveFailed: "Could not open this archive",
    namesFolder: "This link names a folder",
    missing: (name: string) => `${name} is not there`,
    openLocationHint: "Open location shows the folder it points into.",
    openLocation: "Open location",
  },
  {
    notThere: (name, dir) =>
      `${name} здесь нет. Вместо этого открыта папка ${dir}.`,
    findingFile: "Ищу файл…",
    locationFailed: "Не удалось открыть это расположение",
    findingArchive: "Ищу архив…",
    archiveFailed: "Не удалось открыть архив",
    namesFolder: "Эта ссылка ведёт на папку",
    missing: (name) => `${name} здесь нет`,
    openLocationHint:
      "«Открыть расположение» покажет папку, на которую она указывает.",
    openLocation: "Открыть расположение",
  },
);

type Located = RpcOutput<"resolveFileLocation">;

type LocateState =
  | { status: "loading" }
  | { status: "ready"; located: Located }
  | { status: "failed"; message: string };

function folderLabel(path: string): string | null {
  const cut = path.replace(/\/+$/u, "").lastIndexOf("/");
  return cut <= 0 ? null : path.slice(0, cut);
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
      <div className="max-w-md space-y-2">{children}</div>
    </div>
  );
}

function useLocatedFile(
  path: string,
  source: PluginFileOpenerProps["source"],
  onResolved?: (located: Located) => void,
): LocateState {
  const rpc = useFmRpc();
  const [state, setState] = useState<LocateState>({ status: "loading" });
  const { kind, threadId, environmentId, projectId } = source;
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void (async () => {
      try {
        const located = await rpc.call("resolveFileLocation", {
          path,
          source: { kind, threadId, environmentId, projectId },
        });
        if (cancelled) return;
        setState({ status: "ready", located });
        onResolvedRef.current?.(located);
      } catch (failure) {
        if (cancelled) return;
        setState({
          status: "failed",
          message: parseRpcError(failure).rawMessage,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [environmentId, kind, path, projectId, rpc, threadId]);

  return state;
}

function LocationView({
  path,
  source,
  extract = false,
}: Pick<PluginFileOpenerProps, "path" | "source"> & {
  extract?: boolean;
}) {
  const t = useMessages(messages);
  const state = useLocatedFile(path, source, (located) => {
    if (!located.exists) {
      toast.message(
        messagesNow(messages).notThere(basename(path), located.dirPath),
      );
    }
  });

  const location = useLocalLocation("");

  if (state.status === "loading") {
    return <Centered>{t.findingFile}</Centered>;
  }

  if (state.status === "failed") {
    return (
      <Centered>
        <p className="font-medium text-foreground">{t.locationFailed}</p>
        <p>{state.message}</p>
      </Centered>
    );
  }

  const { located } = state;
  return (
    <FileManagerSurface
      location={location}
      chrome="inline"
      initialPath={located.dirPath}
      revealPath={
        located.exists && !located.isDirectory ? located.absolutePath : null
      }
      extractOnReveal={extract}
      initialQuery={located.exists ? "" : (located.matchHint ?? "")}
    />
  );
}

function ArchiveLinkView({
  path,
  source,
  onExtract,
}: Pick<PluginFileOpenerProps, "path" | "source"> & { onExtract: () => void }) {
  const t = useMessages(messages);
  const state = useLocatedFile(path, source);

  if (state.status === "loading") {
    return <Centered>{t.findingArchive}</Centered>;
  }
  if (state.status === "failed") {
    return (
      <Centered>
        <p className="font-medium text-foreground">{t.archiveFailed}</p>
        <p>{state.message}</p>
      </Centered>
    );
  }
  const { located } = state;
  if (!located.exists || located.isDirectory) {
    return (
      <Centered>
        <p className="font-medium text-foreground">
          {located.isDirectory ? t.namesFolder : t.missing(basename(path))}
        </p>
        <p>{t.openLocationHint}</p>
      </Centered>
    );
  }
  return <ArchiveContents path={located.absolutePath} onExtract={onExtract} />;
}

export function FileLocationOpener({ path, source }: PluginFileOpenerProps) {
  return <LocationView path={path} source={source} />;
}

export function FilePreviewOpener({
  path,
  source,
  Original,
}: PluginFileOpenerProps) {
  const t = useMessages(messages);
  const [reveal, setReveal] = useState<{ extract: boolean } | null>(null);
  const folder = folderLabel(path);
  const archive = detectArchiveFormat(basename(path)) !== null;

  if (reveal !== null) {
    return (
      <LocationView path={path} source={source} extract={reveal.extract} />
    );
  }

  return (
    <div className="@container flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {}
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-2">
        {folder === null ? (
          <span className="flex-1" />
        ) : (
          <>
            <Icon
              name="Folder"
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span
              className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
              title={path}
              data-testid="fm-opener-folder"
            >
              {folder}
            </span>
          </>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 shrink-0 gap-1.5 px-2 text-xs"
          data-testid="fm-open-location"
          onClick={() => setReveal({ extract: false })}
        >
          <Icon name="FolderOpen" className="size-4" aria-hidden />
          <span className="hidden @md:inline">{t.openLocation}</span>
        </Button>
      </div>
      {}
      <div
        className="flex min-h-0 flex-1 flex-col overflow-auto"
        data-testid="fm-opener-body"
      >
        {archive ? (
          <ArchiveLinkView
            path={path}
            source={source}
            onExtract={() => setReveal({ extract: true })}
          />
        ) : (
          <Original />
        )}
      </div>
    </div>
  );
}
