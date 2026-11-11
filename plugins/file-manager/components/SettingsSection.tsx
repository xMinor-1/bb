import { useCallback, useEffect, useRef, useState } from "react";
import {
  useSettings,
  type PluginSettingsSectionProps,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";

import { errorToastText } from "../lib/errors";
import { isSamePath } from "../lib/fm-paths";
import { useFmRpc, type RpcOutput } from "../lib/fm-rpc";
import { forgetLastFolder, readLastFolder } from "../lib/last-folder";
import {
  isExternalBooleanSettingChange,
  isExternalSettingChange,
  saveStartFolder,
  startFolderLabel,
  startFolderMessages,
  startFolderNotInUse,
} from "../lib/start-folder";
import { defineMessages, messagesNow, useMessages } from "../lib/i18n";
import { FolderPickerDialog } from "./dialogs/FolderPickerDialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

type PanelState = RpcOutput<"getState">;

const messages = defineMessages(
  {
    loadFailed: "Could not read the File Manager settings.",
    loading: "Loading…",
    unavailable: "Unavailable",
    browse: "Browse…",
    reset: "Reset",
    resetTo: (root: string) => `Reset to ${root}`,
    forgotten: (label: string) =>
      `Forgotten. The panel will open in ${label} next time.`,
    forget: "Forget the remembered folder",
    opensHere: "The panel opens here.",
    restoreOn:
      "Reopening the last folder is on, so this is where the panel opens the first time and whenever the last folder is gone.",
    restoreOff:
      "Reopening the last folder is off, so the panel always opens here.",
    threadFolderOn:
      " Opening the thread's project folder is on, so a File Manager tab inside a thread starts in that thread's folder instead.",
    staysInside: (root: string) => ` Everything stays inside ${root}.`,
    tryAgain: "Try again",
    saving: "Saving…",
    saved: "Saved",
    notInUseBefore: "The saved start folder ",
    notInUseAfter: (root: string) => ` is not in use: the panel opens ${root}.`,
    pickerTitle: "Start folder",
    pickerDescription: "The panel will open in the folder you choose here.",
    useFolder: "Use this folder",
  },
  {
    loadFailed: "Не удалось прочитать настройки файлового менеджера.",
    loading: "Загрузка…",
    unavailable: "Недоступно",
    browse: "Выбрать…",
    reset: "Сбросить",
    resetTo: (root) => `Сбросить на ${root}`,
    forgotten: (label) =>
      `Последняя папка забыта. В следующий раз откроется ${label}.`,
    forget: "Забыть последнюю папку",
    opensHere: "Панель открывается здесь.",
    restoreOn:
      "Открытие последней папки включено: здесь панель откроется в первый раз и когда последней папки уже нет.",
    restoreOff:
      "Открытие последней папки выключено: панель всегда открывается здесь.",
    threadFolderOn:
      " Открытие папки проекта треда включено: вкладка файлового менеджера внутри треда начинает с папки этого треда.",
    staysInside: (root) => ` Всё остаётся внутри ${root}.`,
    tryAgain: "Повторить",
    saving: "Сохраняется…",
    saved: "Сохранено",
    notInUseBefore: "Сохранённая стартовая папка ",
    notInUseAfter: (root) => ` не используется: панель открывает ${root}.`,
    pickerTitle: "Стартовая папка",
    pickerDescription:
      "Панель будет открываться в папке, которую вы здесь выберете.",
    useFolder: "Выбрать эту папку",
  },
);

export function SettingsSection(_props: PluginSettingsSectionProps) {
  const t = useMessages(messages);
  const rpc = useFmRpc();
  const hostSettings = useSettings().values;
  const rawStartFolder = hostSettings?.startFolder;
  const rawRestoreLastFolder = hostSettings?.restoreLastFolder;
  const rawOpenThreadWorkspace = hostSettings?.openThreadWorkspace;

  const [state, setState] = useState<PanelState | null>(null);
  const [stateIsRead, setStateIsRead] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerStart, setPickerStart] = useState<string | null>(null);
  const [hasMemory, setHasMemory] = useState(() => readLastFolder() !== null);

  const activeRef = useRef(true);
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const loadSeqRef = useRef(0);
  const saveGenRef = useRef(0);
  const savingRef = useRef(false);

  const load = useCallback(async (): Promise<void> => {
    const seq = ++loadSeqRef.current;
    const generation = saveGenRef.current;
    const superseded = (): boolean =>
      !activeRef.current ||
      loadSeqRef.current !== seq ||
      saveGenRef.current !== generation;
    try {
      const result = await rpc.call("getState", null);
      if (superseded()) return;
      setState(result);
      setStateIsRead(true);
      setHasMemory(readLastFolder() !== null);
      setLoadError(null);
    } catch (failure) {
      if (superseded()) return;
      setLoadError(errorToastText(failure, messagesNow(messages).loadFailed));
    }
  }, [rpc]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback((): void => {
    if (savingRef.current) return;
    void load();
  }, [load]);

  const lastRawRef = useRef<string | number | boolean | undefined>(undefined);
  useEffect(() => {
    const previous = lastRawRef.current;
    lastRawRef.current = rawStartFolder;
    if (isExternalSettingChange(previous, rawStartFolder)) refresh();
  }, [rawStartFolder, refresh]);

  const lastRawRestoreRef = useRef<string | number | boolean | undefined>(
    undefined,
  );
  useEffect(() => {
    const previous = lastRawRestoreRef.current;
    lastRawRestoreRef.current = rawRestoreLastFolder;
    if (isExternalBooleanSettingChange(previous, rawRestoreLastFolder))
      refresh();
  }, [rawRestoreLastFolder, refresh]);

  const lastRawThreadFolderRef = useRef<string | number | boolean | undefined>(
    undefined,
  );
  useEffect(() => {
    const previous = lastRawThreadFolderRef.current;
    lastRawThreadFolderRef.current = rawOpenThreadWorkspace;
    if (isExternalBooleanSettingChange(previous, rawOpenThreadWorkspace))
      refresh();
  }, [rawOpenThreadWorkspace, refresh]);

  useEffect(() => {
    const onForeground = (): void => {
      if (document.visibilityState === "hidden") return;
      refresh();
    };
    window.addEventListener("focus", onForeground);
    document.addEventListener("visibilitychange", onForeground);
    return () => {
      window.removeEventListener("focus", onForeground);
      document.removeEventListener("visibilitychange", onForeground);
    };
  }, [refresh]);

  const root = state?.root ?? null;
  const startFolder = state?.startFolder ?? null;
  const atRoot = state !== null && isSamePath(state.startFolder, state.root);
  const ready = state !== null;

  const notInUse =
    state === null || !stateIsRead
      ? null
      : startFolderNotInUse(rawStartFolder, state.startFolder, state.root);

  const choose = useCallback(
    (path: string): void => {
      setSaveError(null);
      setSaving(true);
      savingRef.current = true;
      const generation = ++saveGenRef.current;
      void (async () => {
        try {
          const resolved = await saveStartFolder(rpc, path);
          if (!activeRef.current || saveGenRef.current !== generation) return;
          setState((previous) =>
            previous === null
              ? previous
              : { ...previous, startFolder: resolved },
          );
          setStateIsRead(false);
          setLoadError(null);
          toast.success(messagesNow(startFolderMessages).saved);
        } catch (failure) {
          if (!activeRef.current || saveGenRef.current !== generation) return;
          setSaveError(
            errorToastText(
              failure,
              messagesNow(startFolderMessages).saveFailed,
            ),
          );
        } finally {
          if (saveGenRef.current === generation) {
            savingRef.current = false;
            if (activeRef.current) setSaving(false);
          }
        }
      })();
    },
    [rpc],
  );

  return (
    <div className="w-full space-y-2" data-testid="fm-settings-section">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
          <Icon
            name="Folder"
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          {state === null || startFolder === null ? (
            <span className="text-sm text-muted-foreground">
              {loadError === null ? t.loading : t.unavailable}
            </span>
          ) : (
            <>
              <span
                className="min-w-0 flex-1 truncate font-mono text-sm text-foreground"
                title={startFolder}
                data-testid="fm-settings-start-folder"
              >
                {startFolder}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {startFolderLabel(state.startFolder, state.root)}
              </span>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!ready}
            data-testid="fm-settings-browse"
            onClick={() => {
              if (state === null) return;
              setSaveError(null);
              setPickerStart(state.startFolder);
              setPickerOpen(true);
            }}
          >
            <Icon name="FolderOpen" className="size-4" aria-hidden="true" />
            {t.browse}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!ready || saving || atRoot}
            data-testid="fm-settings-reset"
            onClick={() => {
              if (state !== null) choose(state.root);
            }}
          >
            {root === null ? t.reset : t.resetTo(root)}
          </Button>
          {}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!ready || !hasMemory}
            data-testid="fm-settings-forget"
            onClick={() => {
              if (state === null) return;
              forgetLastFolder();
              setHasMemory(false);
              toast.success(
                messagesNow(messages).forgotten(
                  startFolderLabel(
                    state.startFolder,
                    state.root,
                    messagesNow(startFolderMessages).homeInSentence,
                  ),
                ),
              );
            }}
          >
            {t.forget}
          </Button>
        </div>
      </div>

      <div className="flex min-h-5 items-start justify-between gap-4">
        {}
        <p
          className="text-xs leading-relaxed text-muted-foreground"
          data-testid="fm-settings-open-rule"
        >
          {state === null
            ? t.opensHere
            : state.preferences.restoreLastFolder
              ? t.restoreOn
              : t.restoreOff}
          {}
          {state !== null && state.preferences.openThreadWorkspace
            ? t.threadFolderOn
            : null}
          {root === null ? null : t.staysInside(root)}
        </p>
        <div className="flex shrink-0 items-center gap-3">
          {loadError !== null ? (
            <>
              <span className="text-xs text-destructive" role="alert">
                {loadError}
              </span>
              {}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="fm-settings-retry"
                onClick={() => refresh()}
              >
                {t.tryAgain}
              </Button>
            </>
          ) : saveError !== null ? (
            <span className="text-xs text-destructive" role="alert">
              {saveError}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground" role="status">
              {saving ? t.saving : state === null ? t.loading : t.saved}
            </span>
          )}
        </div>
      </div>

      {}
      {notInUse === null || root === null ? null : (
        <p
          className="text-xs leading-relaxed text-warning-text"
          data-testid="fm-settings-fallback"
        >
          {t.notInUseBefore}
          <span className="font-mono">{notInUse}</span>
          {t.notInUseAfter(root)}
        </p>
      )}

      {}
      {pickerStart === null || state === null ? null : (
        <FolderPickerDialog
          open={pickerOpen}
          title={t.pickerTitle}
          description={t.pickerDescription}
          initialPath={pickerStart}
          root={state.root}
          showHidden={state.preferences.showHiddenFiles}
          confirmLabel={t.useFolder}
          onOpenChange={setPickerOpen}
          onChoose={choose}
        />
      )}
    </div>
  );
}
