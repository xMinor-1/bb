import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  useBbNavigate,
  useComposer,
  type PluginNavPanelProps,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";

import {
  MAX_LIST_ENTRIES,
  type FileEntry,
  type FileManagerErrorCode,
  type ViewMode,
} from "../contract";
import { useBookmarks } from "../hooks/useBookmarks";
import { useClipboard } from "../hooks/useClipboard";
import { useRouteLocation, type FmLocation } from "../hooks/useFmLocation";
import {
  matchesQuery,
  useDirectory,
  type ListDirResult,
  type SortDirection,
  type SortField,
} from "../hooks/useDirectory";
import { usePreviewBase } from "../hooks/usePreviewBase";
import { useJobs } from "../hooks/useJobs";
import { useSelection } from "../hooks/useSelection";
import {
  threadWorkspaceBlockedText,
  useThreadWorkspace,
} from "../hooks/useThreadWorkspace";
import { useTree, type UseTreeResult } from "../hooks/useTree";
import { useUploads } from "../hooks/useUploads";
import { bookmarkMessages, findBookmark } from "../lib/bookmarks";
import { addFileMentions } from "../lib/composer-mentions";
import { downloadEntry, downloadZip } from "../lib/download";
import {
  batchFailureText,
  describeErrorCode,
  errorToastText,
  parseRpcError,
  type BatchFailure,
  type ParsedRpcError,
} from "../lib/errors";
import {
  absoluteToSubPath,
  basename,
  dirname,
  getClientRoot,
  isSameOrDescendant,
  isSamePath,
  parentPath as parentOf,
  rootPhrase,
  SEPARATOR,
  setClientRoot,
  subPathToAbsolute,
} from "../lib/fm-paths";
import {
  outsideRootMessage,
  parsePathInput,
  pathInvalidMessage,
} from "../lib/fm-pathbar";
import {
  forgetLastFolder,
  LAST_FOLDER_DEBOUNCE_MS,
  pickInitialFolder,
  readLastFolder,
  rememberLastFolder,
  writeLastFolder,
  type RememberedFolder,
} from "../lib/last-folder";
import {
  AUTO_EXPAND_HOVER_MS,
  MAX_TREE_ROWS,
  topLevelPaths,
  type TreeEntryRow,
} from "../lib/fm-tree";
import { useFmRpc, type RpcOutput } from "../lib/fm-rpc";
import {
  saveStartFolder,
  startFolderLabel,
  startFolderMessages,
} from "../lib/start-folder";
import {
  defineMessages,
  messagesNow,
  pluralRu,
  useMessages,
} from "../lib/i18n";
import type { UploadRequest } from "../lib/upload-manager";
import { isViewableEntry } from "../lib/viewer";
import { ActivityTray, jobSettledText } from "./ActivityTray";
import { BackgroundContextMenu } from "./BackgroundContextMenu";
import { BookmarkMenuItems, BookmarksMenu } from "./BookmarksMenu";
import { EmptyState, type EmptyStateKind } from "./EmptyState";
import { ErrorBanner } from "./ErrorBanner";
import { effectiveKind, isFileEntry } from "./FileRow";
import { FileGallery } from "./FileGallery";
import { FileTable } from "./FileTable";
import { RowContextMenu } from "./RowContextMenu";
import { SelectionActionBar } from "./SelectionActionBar";
import type { SelectedEntryActionsProps } from "./selected-entry-actions";
import { Toolbar } from "./Toolbar";
import { BookmarkNameDialog } from "./dialogs/BookmarkNameDialog";
import { ConfirmDeleteDialog } from "./dialogs/ConfirmDeleteDialog";
import { ConflictDialog, type ConflictChoice } from "./dialogs/ConflictDialog";
import {
  ExtractDialog,
  isFormatSupported,
  type ExtractSubmission,
} from "./dialogs/ExtractDialog";
import { FileViewerDialog } from "./dialogs/FileViewerDialog";
import { FolderPickerDialog } from "./dialogs/FolderPickerDialog";
import { NewFolderDialog } from "./dialogs/NewFolderDialog";
import {
  PropertiesDialog,
  type PropertiesTarget,
} from "./dialogs/PropertiesDialog";
import { RenameDialog } from "./dialogs/RenameDialog";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { useIsCompactViewport } from "@/components/ui/hooks/use-compact-viewport";
import { usePointerCoarse } from "@/components/ui/hooks/use-pointer-coarse";
import {
  publishPanelSnapshot,
  resetPanelSnapshot,
  subscribePanelCommands,
  type PanelCommand,
  type PanelSnapshot,
} from "./panel-bus";
import { PanelActions, type ThreadFolderAction } from "./PanelActions";

const messages = defineMessages(
  {
    restoreGone: (label: string) =>
      `The folder you were last in is gone. Opened ${label} instead.`,
    restoreDenied: (label: string) =>
      `The folder you were last in cannot be opened. Opened ${label} instead.`,
    restoreUnreachable: (label: string) =>
      `The folder you were last in is no longer reachable. Opened ${label} instead.`,
    pathOpenFailed: "Could not open that path.",
    pathNothing: (typed: string) => `There is nothing at ${typed}.`,
    pathDenied: (typed: string) =>
      `You do not have permission to open ${typed}.`,
    pathIoError: "The filesystem reported an error. Try again.",
    showingHidden: (name: string) =>
      `Showing hidden files so ${name} is visible.`,
    revealCutOff: (name: string, count: number) =>
      `${name} is in this folder, but the listing was cut off at ${String(count)} items. Use the filter to find it.`,
    revealGone: (name: string) => `${name} is not in this folder any more.`,
    preferencesFailed: "Could not save your preferences.",
    threadFolderFailed: (detail: string) =>
      `Could not find this thread's folder. ${detail}`,
    linkLeadsNowhere: (root: string) =>
      `That link does not lead anywhere inside ${root}.`,
    moveFailed: "Could not move those items.",
    copyFailed: "Could not copy those items.",
    deleteFailed: "Could not delete those items.",
    pasteFailed: "Could not paste here.",
    pathsCopied: (count: number) =>
      count === 1 ? "Path copied" : `${String(count)} paths copied`,
    clipboardDenied: "This browser did not allow copying to the clipboard.",
    downloadTooMany:
      "Too many items to download at once. Select their folder instead.",
    onlyFilesToChat: "Only files can be added to the chat.",
    addedToChat: (name: string) => `${name} added to the chat`,
    filesAddedToChat: (count: number) =>
      `${String(count)} files added to the chat`,
    linkOutside: (root: string) => `Link points outside ${root}`,
    folderUploadUnsupported:
      "Folder upload is not supported in this browser — drop individual files.",
    backendSilent: "The file manager backend did not answer",
    folderOpenFailed: "Could not open this folder",
    listingTruncated: (shown: number, total: number) =>
      `Showing the first ${String(shown)} of ${String(total)} items. Use the filter to narrow it down.`,
    treeTruncated: (count: number) =>
      `Showing the first ${String(count)} rows. Collapse a folder to see more.`,
    cancelJobFailed: "Could not cancel that job.",
    finishFailed: "Could not finish that operation.",
    moveTo: "Move to…",
    copyTo: "Copy to…",
    chooseFolder: "Choose this folder",
    move: "Move",
    copy: "Copy",
  },
  {
    restoreGone: (label) =>
      `Папки, в которой вы были в прошлый раз, больше нет. Вместо неё открыта ${label}.`,
    restoreDenied: (label) =>
      `Папку, в которой вы были в прошлый раз, не открыть. Вместо неё открыта ${label}.`,
    restoreUnreachable: (label) =>
      `Папка, в которой вы были в прошлый раз, больше недоступна. Вместо неё открыта ${label}.`,
    pathOpenFailed: "Не удалось открыть этот путь.",
    pathNothing: (typed) => `По пути ${typed} ничего нет.`,
    pathDenied: (typed) => `Нет доступа к ${typed}.`,
    pathIoError: "Файловая система сообщила об ошибке. Попробуйте ещё раз.",
    showingHidden: (name) => `Скрытые файлы показаны, чтобы был виден ${name}.`,
    revealCutOff: (name, count) =>
      `${name} есть в этой папке, но список обрезан на ${String(count)} ${pluralRu(count, ["элементе", "элементах", "элементах"])}. Найдите его через фильтр.`,
    revealGone: (name) => `${name} в этой папке больше нет.`,
    preferencesFailed: "Не удалось сохранить настройки.",
    threadFolderFailed: (detail) =>
      `Не удалось найти папку этого треда. ${detail}`,
    linkLeadsNowhere: (root) => `Эта ссылка не ведёт никуда внутри ${root}.`,
    moveFailed: "Не удалось переместить.",
    copyFailed: "Не удалось скопировать.",
    deleteFailed: "Не удалось удалить.",
    pasteFailed: "Не удалось вставить сюда.",
    pathsCopied: (count) =>
      count === 1
        ? "Путь скопирован"
        : `${pluralRu(count, ["Скопирован", "Скопировано", "Скопировано"])} ${String(count)} ${pluralRu(count, ["путь", "пути", "путей"])}`,
    clipboardDenied: "Браузер не разрешил копировать в буфер обмена.",
    downloadTooMany:
      "Слишком много элементов для одного скачивания. Выберите их папку.",
    onlyFilesToChat: "В чат можно добавить только файлы.",
    addedToChat: (name) => `${name} добавлен в чат`,
    filesAddedToChat: (count) =>
      `${String(count)} ${pluralRu(count, ["файл добавлен", "файла добавлены", "файлов добавлено"])} в чат`,
    linkOutside: (root) => `Ссылка ведёт за пределы ${root}`,
    folderUploadUnsupported:
      "Этот браузер не умеет загружать папки — перетащите файлы по одному.",
    backendSilent: "Сервер файлового менеджера не ответил",
    folderOpenFailed: "Не удалось открыть эту папку",
    listingTruncated: (shown, total) =>
      `Показаны первые ${String(shown)} из ${String(total)}. Сузьте список фильтром.`,
    treeTruncated: (count) =>
      `Показаны первые ${String(count)} ${pluralRu(count, ["строка", "строки", "строк"])}. Сверните папку, чтобы увидеть остальное.`,
    cancelJobFailed: "Не удалось отменить задание.",
    finishFailed: "Не удалось завершить операцию.",
    moveTo: "Переместить в…",
    copyTo: "Копировать в…",
    chooseFolder: "Выбрать эту папку",
    move: "Переместить",
    copy: "Копировать",
  },
);

type GetState = RpcOutput<"getState">;
type BatchResult = RpcOutput<"moveEntries">;

const DRAG_MIME = "application/x-bb-file-manager";

const DEFAULT_ARCHIVE_SUPPORT = {
  zip: false,
  tar: false,
  sevenZip: false,
  rar: false,
};

const NO_ENTRIES: readonly FileEntry[] = [];

type DialogState =
  | { kind: "none" }
  | { kind: "new-folder" }
  | { kind: "rename"; entry: FileEntry }
  | { kind: "delete"; entries: FileEntry[] }
  | { kind: "extract"; entry: FileEntry }
  | { kind: "view"; entry: FileEntry }
  | { kind: "properties"; target: PropertiesTarget }
  | { kind: "bookmark-name"; path: string; name: string }
  | { kind: "picker"; mode: "move" | "copy"; paths: string[] }
  | {
      kind: "conflict";
      operation: "move" | "copy";
      destinationDir: string;
      paths: string[];
      conflicts: BatchFailure[];
    };

const listingTimes = new WeakMap<object, number>();

function listingTimeMs(listing: object | null): number {
  if (listing === null) return Date.now();
  const known = listingTimes.get(listing);
  if (known !== undefined) return known;
  const now = Date.now();
  listingTimes.set(listing, now);
  return now;
}

function isExternalDrag(event: ReactDragEvent<HTMLElement>): boolean {
  const types = (event.dataTransfer as DataTransfer | undefined)?.types;
  return types !== undefined && Array.from(types).includes("Files");
}

function readDraggedPaths(dataTransfer: DataTransfer): string[] {
  const raw = dataTransfer.getData(DRAG_MIME);
  if (raw !== "") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (value): value is string => typeof value === "string",
        );
      }
    } catch {}
  }
  const text = dataTransfer.getData("text/plain");
  if (text === "") return [];
  return text.split("\n").filter((line) => line.startsWith("/"));
}

function snapshotDropEntries(
  dataTransfer: DataTransfer,
): FileSystemEntry[] | null {
  const items = dataTransfer.items;
  if (items.length === 0) return null;
  const collected: FileSystemEntry[] = [];
  for (const item of Array.from(items)) {
    if (item.kind !== "file") continue;
    if (typeof item.webkitGetAsEntry !== "function") return null;
    const entry = item.webkitGetAsEntry();
    if (entry !== null) collected.push(entry);
  }
  return collected.length === 0 ? null : collected;
}

async function walkDropEntry(
  entry: FileSystemEntry,
  prefix: string,
  out: { file: File; relativeDir: string }[],
): Promise<void> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File | null>((resolve) => {
      fileEntry.file(resolve, () => resolve(null));
    });
    if (file !== null) out.push({ file, relativeDir: prefix });
    return;
  }
  if (!entry.isDirectory) return;
  const directoryEntry = entry as FileSystemDirectoryEntry;
  const childPrefix = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
  const reader = directoryEntry.createReader();
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve) => {
      reader.readEntries(resolve, () => resolve([]));
    });
    if (batch.length === 0) break;
    for (const child of batch) await walkDropEntry(child, childPrefix, out);
  }
}

async function writeClipboardText(text: string): Promise<boolean> {
  try {
    const clipboard: unknown =
      typeof navigator === "undefined"
        ? undefined
        : (navigator as Navigator).clipboard;
    if (clipboard !== undefined && clipboard !== null) {
      await (clipboard as Clipboard).writeText(text);
      return true;
    }
  } catch {}
  return false;
}

const RESTORE_FALLBACK_CODES: ReadonlySet<FileManagerErrorCode> =
  new Set<FileManagerErrorCode>([
    "not_found",
    "not_a_directory",
    "permission_denied",
    "path_escape",
    "invalid_path",
  ]);

function restoreFallbackText(
  code: FileManagerErrorCode,
  label: string,
): string {
  const t = messagesNow(messages);
  switch (code) {
    case "not_found":
    case "not_a_directory":
      return t.restoreGone(label);
    case "permission_denied":
      return t.restoreDenied(label);
    default:
      return t.restoreUnreachable(label);
  }
}

function pathCommitErrorText(
  failure: unknown,
  typed: string,
  root: string,
): string {
  const t = messagesNow(messages);
  const parsed = parseRpcError(failure);
  switch (parsed.code) {
    case null:
      return errorToastText(failure, t.pathOpenFailed);
    case "not_found":
      return t.pathNothing(typed);
    case "permission_denied":
      return t.pathDenied(typed);
    case "path_escape":
      return outsideRootMessage(root);
    case "invalid_path":
    case "invalid_name":
      return pathInvalidMessage();
    case "io_error":
      return t.pathIoError;
    default:
      return describeErrorCode(parsed.code);
  }
}

interface PendingReveal {
  path: string;
  dir: string;
  name: string;
  since: ListDirResult | null;
  extract: boolean;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable === true
  );
}

function isActivationTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.closest(
      'button, a[href], summary, [role="button"], [role="checkbox"]',
    ) !== null
  );
}

export interface FileManagerSurfaceProps {
  location: FmLocation;
  chrome: "host-header" | "inline";
  initialPath?: string | null;
  revealPath?: string | null;
  extractOnReveal?: boolean;
  initialQuery?: string;
  threadId?: string | null;
}

export function FileManagerSurface({
  location,
  chrome,
  initialPath = null,
  revealPath = null,
  extractOnReveal = false,
  initialQuery = "",
  threadId = null,
}: FileManagerSurfaceProps) {
  const t = useMessages(messages);
  const rpc = useFmRpc();
  const isCompactViewport = useIsCompactViewport();
  const isCoarsePointer = usePointerCoarse();
  const selectionBarEnabled = isCompactViewport || isCoarsePointer;
  const rowDragEnabled = !isCoarsePointer;
  const subPath = location.subPath;
  const locationRef = useRef(location);
  locationRef.current = location;
  const inlineChrome = chrome === "inline";
  const initialPathRef = useRef(initialPath);
  const bootstrapThreadIdRef = useRef(threadId);

  const [state, setState] = useState<GetState | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [stateError, setStateError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const navigate = useBbNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const composer = useComposer();
  const composerRef = useRef(composer);
  composerRef.current = composer;

  const root = state?.root ?? getClientRoot();
  const currentPath = useMemo(
    () => subPathToAbsolute(subPath, root),
    [subPath, root],
  );
  const currentPathRef = useRef(currentPath);
  currentPathRef.current = currentPath;

  const [showHidden, setShowHidden] = useState(false);
  const showHiddenRef = useRef(showHidden);
  showHiddenRef.current = showHidden;
  const [confirmOnDelete, setConfirmOnDelete] = useState(true);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const galleryView = viewMode === "gallery";
  const [query, setQuery] = useState(initialQuery);
  const queryRef = useRef(query);
  queryRef.current = query;
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [contextTarget, setContextTarget] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [externalDrag, setExternalDrag] = useState(false);

  const [searchOpen, setSearchOpen] = useState(initialQuery !== "");
  const searchOpenRef = useRef(searchOpen);
  searchOpenRef.current = searchOpen;

  const [pathEditing, setPathEditing] = useState(false);
  const [pathError, setPathError] = useState<string | null>(null);
  const [pathBusy, setPathBusy] = useState(false);
  const [pathFocusTick, setPathFocusTick] = useState(0);
  const pathEditingRef = useRef(false);
  const pathTicketRef = useRef(0);
  const [pendingReveal, setPendingReveal] = useState<PendingReveal | null>(
    null,
  );

  const [restorePending, setRestorePending] = useState<string | null>(null);
  const [swallowedError, setSwallowedError] = useState<ParsedRpcError | null>(
    null,
  );
  const lastFolderPendingRef = useRef<RememberedFolder | null>(null);
  const [redirectPending, setRedirectPending] = useState(false);
  const redirectFromRef = useRef<string | null>(null);
  const lastFolderWrittenRef = useRef<RememberedFolder | null>(null);
  const lastFolderTimerRef = useRef<number | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLTableElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contextRowRef = useRef<string | null>(null);
  const pendingDropTargetRef = useRef<string | null>(null);
  const dragDepthRef = useRef(0);
  const subPathRef = useRef(subPath);
  subPathRef.current = subPath;

  const focusSurface = useCallback(() => {
    (gridRef.current ?? galleryRef.current)?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await rpc.call("getState", null);
        if (cancelled) return;
        setClientRoot(result.root);
        setState(result);
        setShowHidden(result.preferences.showHiddenFiles);
        setConfirmOnDelete(result.preferences.confirmOnDelete);
        setSortField(result.preferences.sortField);
        setSortDirection(result.preferences.sortDirection);
        setViewMode(result.preferences.viewMode);
        setStateError(null);
        const requested = initialPathRef.current;
        if (requested !== null) {
          const targetSubPath = absoluteToSubPath(requested, result.root);
          if (targetSubPath !== subPathRef.current) {
            redirectFromRef.current = subPathRef.current;
            setRedirectPending(true);
            locationRef.current.navigate(targetSubPath, { replace: true });
          }
          return;
        }
        const bootstrapThreadId = bootstrapThreadIdRef.current;
        let workspaceFolder: string | null = null;
        if (
          result.preferences.openThreadWorkspace &&
          bootstrapThreadId !== null
        ) {
          const answer = await rpc
            .call("threadWorkspace", { threadId: bootstrapThreadId })
            .catch(() => null);
          if (cancelled) return;
          if (
            answer !== null &&
            answer.reason === null &&
            answer.path !== null
          ) {
            workspaceFolder = answer.path;
          }
        }
        const choice = pickInitialFolder({
          subPath: subPathRef.current,
          remembered: readLastFolder(),
          workspaceFolder,
          startFolder: result.startFolder,
          root: result.root,
          restoreLastFolder: result.preferences.restoreLastFolder,
        });
        if (
          choice.source !== "deep-link" &&
          !isSamePath(choice.path, result.root)
        ) {
          if (choice.source === "memory") setRestorePending(choice.path);
          redirectFromRef.current = subPathRef.current;
          setRedirectPending(true);
          locationRef.current.navigate(
            absoluteToSubPath(choice.path, result.root),
            {
              replace: true,
            },
          );
        }
      } catch (failure) {
        if (!cancelled) setStateError(parseRpcError(failure).rawMessage);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rpc]);

  useEffect(() => {
    if (!redirectPending) return;
    if (
      redirectFromRef.current === null ||
      subPath !== redirectFromRef.current
    ) {
      redirectFromRef.current = null;
      setRedirectPending(false);
    }
  }, [redirectPending, subPath]);

  const listingEnabled = ready && !redirectPending;

  const directory = useDirectory({
    path: currentPath,
    showHidden,
    sortField,
    sortDirection,
    enabled: listingEnabled,
  });
  const tree = useTree({
    rootPath: currentPath,
    rootEntries: directory.entries,
    showHidden,
    sortField,
    sortDirection,
    query,
    enabled: listingEnabled,
  });
  const treeRef = useRef<UseTreeResult>(tree);
  treeRef.current = tree;

  const [pendingMoved, setPendingMoved] = useState<readonly string[]>([]);
  const { rows, visiblePaths } = useMemo(() => {
    if (pendingMoved.length === 0) {
      return { rows: tree.rows, visiblePaths: tree.visiblePaths };
    }
    const hidden = (path: string): boolean =>
      pendingMoved.some((moved) => isSameOrDescendant(path, moved));
    const kept = tree.rows.filter((row) =>
      row.kind === "entry" ? !hidden(row.entry.path) : !hidden(row.parentPath),
    );
    return {
      rows: kept,
      visiblePaths: kept.flatMap((row) =>
        row.kind === "entry" ? [row.entry.path] : [],
      ),
    };
  }, [pendingMoved, tree.rows, tree.visiblePaths]);

  const galleryEntries = useMemo(() => {
    if (!galleryView) return NO_ENTRIES;
    const matched =
      query.trim() === ""
        ? directory.entries
        : directory.entries.filter((entry) => matchesQuery(entry, query));
    if (pendingMoved.length === 0) return matched;
    return matched.filter(
      (entry) =>
        !pendingMoved.some((moved) => isSameOrDescendant(entry.path, moved)),
    );
  }, [directory.entries, galleryView, pendingMoved, query]);

  const galleryPaths = useMemo(
    () => galleryEntries.map((entry) => entry.path),
    [galleryEntries],
  );

  const previewBaseUrl = usePreviewBase({
    path: currentPath,
    enabled: galleryView && listingEnabled,
  });

  useEffect(() => {
    setPendingMoved((previous) => (previous.length === 0 ? previous : []));
  }, [directory.data]);

  const selection = useSelection(galleryView ? galleryPaths : visiblePaths);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const clipboard = useClipboard();
  const uploads = useUploads();
  const bookmarks = useBookmarks();
  const refetchRef = useRef(directory.refetch);
  refetchRef.current = directory.refetch;
  const directoryDataRef = useRef(directory.data);
  directoryDataRef.current = directory.data;
  const jobs = useJobs({
    onFinished: (job) => {
      if (job.state === "done") toast.success(jobSettledText(job));
      else if (job.state === "failed") toast.error(jobSettledText(job));
      refetchRef.current();
    },
    onVanished: () => {
      refetchRef.current();
    },
  });

  const writable = directory.data?.writable ?? true;
  const archiveSupport = state?.archiveSupport ?? DEFAULT_ARCHIVE_SUPPORT;
  const rowByPath = useMemo(() => {
    const map = new Map<string, TreeEntryRow>();
    for (const row of rows)
      if (row.kind === "entry") map.set(row.entry.path, row);
    return map;
  }, [rows]);
  const rowByPathRef = useRef(rowByPath);
  rowByPathRef.current = rowByPath;
  const entryByPath = useMemo(() => {
    const map = new Map<string, FileEntry>();
    if (galleryView) {
      for (const entry of galleryEntries) map.set(entry.path, entry);
      return map;
    }
    for (const [path, row] of rowByPath) map.set(path, row.entry);
    return map;
  }, [galleryEntries, galleryView, rowByPath]);
  const existingNames = useMemo(
    () => new Set((directory.data?.entries ?? []).map((entry) => entry.name)),
    [directory.data],
  );
  const siblingNames = useCallback(
    (path: string): ReadonlySet<string> => {
      const parent = dirname(path);
      if (isSamePath(parent, currentPathRef.current)) return existingNames;
      const entries = treeRef.current.nodeEntries(parent);
      return entries === null
        ? new Set<string>()
        : new Set(entries.map((entry) => entry.name));
    },
    [existingNames],
  );
  const selectedEntries = useMemo(
    () =>
      selection.selectedPaths
        .map((path) => entryByPath.get(path))
        .filter((entry): entry is FileEntry => entry !== undefined),
    [selection.selectedPaths, entryByPath],
  );
  const canPaste = clipboard.canPasteInto(currentPath);
  const nowMs = useMemo(() => listingTimeMs(directory.data), [directory.data]);

  useEffect(() => {
    const listed = directory.data?.path;
    if (!listingEnabled || listed === undefined || root === SEPARATOR) return;
    const written = lastFolderWrittenRef.current;
    if (written !== null && written.path === listed && written.root === root)
      return;
    const value: RememberedFolder = { path: listed, root };
    lastFolderWrittenRef.current = value;
    rememberLastFolder(value);
    lastFolderPendingRef.current = value;
    if (lastFolderTimerRef.current !== null)
      window.clearTimeout(lastFolderTimerRef.current);
    lastFolderTimerRef.current = window.setTimeout(() => {
      lastFolderTimerRef.current = null;
      lastFolderPendingRef.current = null;
      writeLastFolder(value);
    }, LAST_FOLDER_DEBOUNCE_MS);
  }, [directory.data, listingEnabled, root]);

  useEffect(
    () => () => {
      if (lastFolderTimerRef.current !== null)
        window.clearTimeout(lastFolderTimerRef.current);
      lastFolderTimerRef.current = null;
      const pending = lastFolderPendingRef.current;
      lastFolderPendingRef.current = null;
      if (pending !== null) writeLastFolder(pending);
    },
    [],
  );

  const restoreFallbackCode: FileManagerErrorCode | null =
    restorePending !== null &&
    directory.error !== null &&
    directory.error.code !== null &&
    RESTORE_FALLBACK_CODES.has(directory.error.code) &&
    isSamePath(currentPath, restorePending)
      ? directory.error.code
      : null;

  const restoreFallbackMoves =
    restoreFallbackCode !== null &&
    state !== null &&
    !isSamePath(state.startFolder, currentPath);

  useEffect(() => {
    if (restorePending === null || directory.data === null) return;
    if (isSamePath(directory.data.path, restorePending))
      setRestorePending(null);
  }, [directory.data, restorePending]);

  useEffect(() => {
    if (
      restoreFallbackCode === null ||
      state === null ||
      directory.error === null
    )
      return;
    setRestorePending(null);
    forgetLastFolder();
    lastFolderWrittenRef.current = null;
    if (!restoreFallbackMoves) return;
    setSwallowedError(directory.error);
    locationRef.current.navigate(
      absoluteToSubPath(state.startFolder, state.root),
      {
        replace: true,
      },
    );
    toast.message(
      restoreFallbackText(
        restoreFallbackCode,
        startFolderLabel(
          state.startFolder,
          state.root,
          messagesNow(startFolderMessages).homeInSentence,
        ),
      ),
    );
  }, [directory.error, restoreFallbackCode, restoreFallbackMoves, state]);

  useEffect(() => {
    if (swallowedError !== null && directory.error !== swallowedError)
      setSwallowedError(null);
  }, [directory.error, swallowedError]);

  const revealArmedRef = useRef(false);
  useEffect(() => {
    if (revealPath === null || state === null || revealArmedRef.current) return;
    revealArmedRef.current = true;
    const name = basename(revealPath);
    let since: ListDirResult | null = null;
    if (name.startsWith(".") && !showHiddenRef.current) {
      setShowHidden(true);
      since = directoryDataRef.current;
      toast.message(messagesNow(messages).showingHidden(name));
    }
    setPendingReveal({
      path: revealPath,
      dir: dirname(revealPath),
      name,
      since,
      extract: extractOnReveal,
    });
  }, [extractOnReveal, revealPath, state]);

  useEffect(() => {
    const pending = pendingReveal;
    if (pending === null) return;
    if (visiblePaths.includes(pending.path)) {
      setPendingReveal(null);
      selectionRef.current.select(pending.path);
      const entry = pending.extract ? entryByPath.get(pending.path) : undefined;
      if (entry !== undefined && entry.archiveFormat !== null)
        setDialog({ kind: "extract", entry });
      return;
    }
    const data = directory.data;
    if (data === null || directory.isLoading || directory.isRefetching) return;
    if (!isSamePath(data.path, pending.dir)) return;
    if (pending.since !== null && data === pending.since && !data.truncated)
      return;
    setPendingReveal(null);
    toast.message(
      data.truncated
        ? messagesNow(messages).revealCutOff(
            pending.name,
            state?.maxListEntries ?? MAX_LIST_ENTRIES,
          )
        : messagesNow(messages).revealGone(pending.name),
    );
  }, [
    directory.data,
    directory.isLoading,
    directory.isRefetching,
    entryByPath,
    pendingReveal,
    state,
    visiblePaths,
  ]);

  const persist = useCallback(
    (values: Parameters<typeof rpc.call<"savePreferences">>[1]) => {
      void (async () => {
        try {
          await rpc.call("savePreferences", values);
        } catch (failure) {
          toast.error(
            errorToastText(failure, messagesNow(messages).preferencesFailed),
          );
        }
      })();
    },
    [rpc],
  );

  const toggleHidden = useCallback(() => {
    setShowHidden((previous) => {
      persist({ showHiddenFiles: !previous });
      return !previous;
    });
  }, [persist]);

  const applySortField = useCallback(
    (field: SortField) => {
      setSortField(field);
      persist({ sortField: field });
    },
    [persist],
  );

  const applySortDirection = useCallback(
    (direction: SortDirection) => {
      setSortDirection(direction);
      persist({ sortDirection: direction });
    },
    [persist],
  );

  const applyViewMode = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode);
      persist({ viewMode: mode });
    },
    [persist],
  );

  const handleHeaderSort = useCallback(
    (field: SortField) => {
      if (field === sortField) {
        const next: SortDirection = sortDirection === "asc" ? "desc" : "asc";
        setSortDirection(next);
        persist({ sortDirection: next });
        return;
      }
      setSortField(field);
      setSortDirection("asc");
      persist({ sortField: field, sortDirection: "asc" });
    },
    [persist, sortDirection, sortField],
  );

  const navigateTo = useCallback((absolute: string) => {
    setPendingReveal(null);
    setRestorePending(null);
    redirectFromRef.current = null;
    setRedirectPending(false);
    locationRef.current.navigate(absoluteToSubPath(absolute));
  }, []);

  const parentPath = directory.data?.parentPath ?? parentOf(currentPath, root);

  const goToParent = useCallback(() => {
    if (parentPath !== null) navigateTo(parentPath);
  }, [navigateTo, parentPath]);

  const workspace = useThreadWorkspace(threadId);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  const openThreadWorkspace = useCallback(() => {
    void (async () => {
      const current = workspaceRef.current;
      const answer =
        current.state.status === "ready"
          ? current.state
          : await current.reload();
      if (answer.status === "ready") {
        navigateTo(answer.path);
        return;
      }
      if (answer.status === "blocked") {
        toast.message(threadWorkspaceBlockedText(answer.reason));
        return;
      }
      if (answer.status === "failed") {
        toast.error(messagesNow(messages).threadFolderFailed(answer.message));
      }
    })();
  }, [navigateTo]);

  const threadFolder = useMemo<ThreadFolderAction | null>(() => {
    const status = workspace.state.status;
    if (status === "absent" || status === "loading") return null;
    return {
      available: status !== "blocked",
      blockedReason:
        workspace.state.status === "blocked"
          ? threadWorkspaceBlockedText(workspace.state.reason)
          : null,
      onOpen: openThreadWorkspace,
    };
  }, [openThreadWorkspace, workspace.state]);

  const openPathBar = useCallback(() => {
    if (searchOpenRef.current) {
      setSearchOpen(false);
      setQuery("");
    }
    if (!pathEditingRef.current) setPathError(null);
    pathEditingRef.current = true;
    setPathEditing(true);
    setPathFocusTick((tick) => tick + 1);
  }, []);

  const closePathBar = useCallback(
    (focusGrid: boolean) => {
      pathEditingRef.current = false;
      setPathEditing(false);
      setPathError(null);
      pathTicketRef.current += 1;
      setPathBusy(false);
      if (focusGrid) focusSurface();
    },
    [focusSurface],
  );

  const handlePathCancel = useCallback(
    (options: { focusGrid: boolean }) => {
      closePathBar(options.focusGrid);
    },
    [closePathBar],
  );

  const handlePathDirty = useCallback(() => {
    setPathError((previous) => (previous === null ? previous : null));
  }, []);

  const submitPath = useCallback(
    (raw: string) => {
      const parsed = parsePathInput(raw, {
        root,
        currentPath: currentPathRef.current,
      });
      if (parsed.kind === "empty") {
        closePathBar(true);
        return;
      }
      if (parsed.kind === "refused") {
        setPathError(parsed.message);
        return;
      }
      const typed = parsed.absolute;
      const ticket = (pathTicketRef.current += 1);
      setPathBusy(true);
      void (async () => {
        try {
          const result = await rpc.call("statPath", { path: typed });
          if (pathTicketRef.current !== ticket) return;
          const entry = result.entry;
          if (entry.escapesRoot) {
            setPathError(
              messagesNow(messages).linkLeadsNowhere(rootPhrase(root)),
            );
            return;
          }
          if (effectiveKind(entry) === "directory") {
            if (isSamePath(entry.path, currentPathRef.current))
              setPendingReveal(null);
            else navigateTo(entry.path);
            closePathBar(true);
            return;
          }
          const dir = result.parentPath ?? dirname(entry.path);
          if (queryRef.current !== "") setQuery("");
          let since: ListDirResult | null = null;
          if (entry.isHidden && !showHiddenRef.current) {
            setShowHidden(true);
            since = directoryDataRef.current;
            toast.message(messagesNow(messages).showingHidden(entry.name));
          }
          if (!isSamePath(dir, currentPathRef.current)) navigateTo(dir);
          setPendingReveal({
            path: entry.path,
            dir,
            name: entry.name,
            since,
            extract: false,
          });
          closePathBar(true);
        } catch (failure) {
          if (pathTicketRef.current !== ticket) return;
          setPathError(pathCommitErrorText(failure, typed, root));
        } finally {
          if (pathTicketRef.current === ticket) setPathBusy(false);
        }
      })();
    },
    [closePathBar, navigateTo, root, rpc],
  );

  const applyBatch = useCallback(
    (
      result: BatchResult,
      operation: "move" | "copy" | "delete",
      retry?: { destinationDir: string },
    ) => {
      const conflicts = result.failed.filter(
        (failure) => failure.code === "exists",
      );
      if (
        conflicts.length > 0 &&
        retry !== undefined &&
        operation !== "delete"
      ) {
        setDialog({
          kind: "conflict",
          operation,
          destinationDir: retry.destinationDir,
          paths: conflicts.map((conflict) => conflict.path),
          conflicts,
        });
      } else if (result.failed.length > 0) {
        const text = batchFailureText(result.failed, operation);
        if (text !== null) toast.error(text);
      }
      if (operation !== "copy") treeRef.current.pruneSubtree(result.succeeded);
      refetchRef.current();
    },
    [],
  );

  const moveTo = useCallback(
    (paths: readonly string[], destinationDir: string) => {
      const targets = topLevelPaths(paths).filter(
        (path) => !isSamePath(dirname(path), destinationDir),
      );
      if (targets.length === 0) return;
      const restore = (only?: ReadonlySet<string>): void => {
        setPendingMoved((previous) =>
          previous.filter(
            (path) =>
              !targets.includes(path) ||
              (only !== undefined && !only.has(path)),
          ),
        );
      };
      void (async () => {
        setPendingMoved((previous) => [...previous, ...targets]);
        try {
          const result = await rpc.call("moveEntries", {
            paths: [...targets],
            destinationDir,
            conflict: "fail",
          });
          restore(new Set(result.failed.map((failure) => failure.path)));
          applyBatch(result, "move", { destinationDir });
        } catch (failure) {
          restore();
          toast.error(
            errorToastText(failure, messagesNow(messages).moveFailed),
          );
        }
      })();
    },
    [applyBatch, rpc],
  );

  const copyTo = useCallback(
    (paths: readonly string[], destinationDir: string) => {
      void (async () => {
        try {
          const result = await rpc.call("copyEntries", {
            paths: topLevelPaths(paths),
            destinationDir,
            conflict: "rename",
          });
          applyBatch(result, "copy");
        } catch (failure) {
          toast.error(
            errorToastText(failure, messagesNow(messages).copyFailed),
          );
        }
      })();
    },
    [applyBatch, rpc],
  );

  const deleteEntries = useCallback(
    async (entries: readonly FileEntry[]): Promise<void> => {
      if (entries.length === 0) return;
      try {
        const result = await rpc.call("deleteEntries", {
          paths: entries.map((entry) => entry.path),
          recursive: true,
        });
        applyBatch(result, "delete");
      } catch (failure) {
        toast.error(
          errorToastText(failure, messagesNow(messages).deleteFailed),
        );
      }
    },
    [applyBatch, rpc],
  );

  const requestDelete = useCallback(
    (entries: readonly FileEntry[]) => {
      const keep = new Set(topLevelPaths(entries.map((entry) => entry.path)));
      const targets = entries.filter((entry) => keep.has(entry.path));
      if (targets.length === 0) return;
      if (confirmOnDelete) {
        setDialog({ kind: "delete", entries: targets });
        return;
      }
      void deleteEntries(targets);
    },
    [confirmOnDelete, deleteEntries],
  );

  const paste = useCallback(() => {
    const pending = clipboard.clipboard;
    if (pending === null) return;
    const destinationDir = currentPathRef.current;
    void (async () => {
      try {
        const result = await clipboard.paste(destinationDir);
        if (result === null) return;
        applyBatch(result, pending.mode === "cut" ? "move" : "copy", {
          destinationDir,
        });
      } catch (failure) {
        toast.error(errorToastText(failure, messagesNow(messages).pasteFailed));
      }
    })();
  }, [applyBatch, clipboard]);

  const copyPathsToClipboard = useCallback((paths: readonly string[]) => {
    if (paths.length === 0) return;
    void (async () => {
      const ok = await writeClipboardText(paths.join("\n"));
      if (ok) toast.success(messagesNow(messages).pathsCopied(paths.length));
      else toast.error(messagesNow(messages).clipboardDenied);
    })();
  }, []);

  const downloadSelection = useCallback((entries: readonly FileEntry[]) => {
    const usable = entries.filter((entry) => {
      const kind = effectiveKind(entry);
      return !entry.escapesRoot && (kind === "file" || kind === "directory");
    });
    const paths = topLevelPaths(usable.map((entry) => entry.path));
    const single = usable.length === 1 ? usable[0] : undefined;
    if (single !== undefined && effectiveKind(single) === "file") {
      downloadEntry(single);
      return;
    }
    if (paths.length === 0) return;
    if (downloadZip(paths) === null) {
      toast.error(messagesNow(messages).downloadTooMany);
    }
  }, []);

  const addToChat = useCallback((entries: readonly FileEntry[]) => {
    const files = entries.filter(isFileEntry);
    if (files.length === 0) {
      toast.error(messagesNow(messages).onlyFilesToChat);
      return;
    }
    addFileMentions(composerRef.current, files);
    toast.success(
      files.length === 1 && files[0] !== undefined
        ? messagesNow(messages).addedToChat(files[0].name)
        : messagesNow(messages).filesAddedToChat(files.length),
    );
  }, []);

  const previewEntry = useCallback((entry: FileEntry): boolean => {
    const hostId = stateRef.current?.primaryHostId ?? null;
    if (hostId === null) return false;
    const open = navigateRef.current?.experimental_openFilePreview;
    if (typeof open !== "function") return false;
    try {
      return open({
        target: { kind: "host", hostId, path: entry.path },
        location: null,
      });
    } catch {
      return false;
    }
  }, []);

  const showEntry = useCallback(
    (entry: FileEntry) => {
      if (previewEntry(entry)) return;
      setDialog({ kind: "view", entry });
    },
    [previewEntry],
  );

  const openEntry = useCallback(
    (entry: FileEntry) => {
      if (entry.escapesRoot) {
        toast.error(messagesNow(messages).linkOutside(root));
        return;
      }
      const kind = effectiveKind(entry);
      if (kind === "directory") {
        navigateTo(entry.path);
        return;
      }
      if (entry.archiveFormat !== null) {
        setDialog({ kind: "extract", entry });
        return;
      }
      if (!isViewableEntry(entry)) {
        downloadEntry(entry);
        return;
      }
      showEntry(entry);
    },
    [navigateTo, root, showEntry],
  );

  const startExtract = useCallback(
    async (submission: ExtractSubmission): Promise<void> => {
      const result = await rpc.call("extractArchive", {
        archivePath: submission.entry.path,
        destinationDir: submission.destinationDir,
        createSubfolder: submission.createSubfolder,
        conflict: "rename",
      });
      jobs.track(result.job);
    },
    [jobs, rpc],
  );

  const setStartFolder = useCallback(
    (path: string) => {
      void (async () => {
        try {
          await saveStartFolder(rpc, path);
          toast.success(messagesNow(startFolderMessages).saved);
        } catch (failure) {
          toast.error(
            errorToastText(
              failure,
              messagesNow(startFolderMessages).saveFailed,
            ),
          );
        }
      })();
    },
    [rpc],
  );

  const bookmarksRef = useRef(bookmarks);
  bookmarksRef.current = bookmarks;

  const toggleBookmark = useCallback((path: string) => {
    const state = bookmarksRef.current;
    if (path === "" || state.loading) return;
    if (state.isBookmarked(path)) {
      void state.remove(path).catch((failure: unknown) => {
        toast.error(
          errorToastText(failure, messagesNow(bookmarkMessages).removeFailed),
        );
      });
      return;
    }
    if (state.full) {
      toast.error(messagesNow(bookmarkMessages).full);
      return;
    }
    void state.add(path).catch((failure: unknown) => {
      toast.error(
        errorToastText(failure, messagesNow(bookmarkMessages).addFailed),
      );
    });
  }, []);

  const removeBookmark = useCallback((path: string) => {
    void bookmarksRef.current.remove(path).catch((failure: unknown) => {
      toast.error(
        errorToastText(failure, messagesNow(bookmarkMessages).removeFailed),
      );
    });
  }, []);

  const openBookmarkRename = useCallback((path: string) => {
    const bookmark = findBookmark(bookmarksRef.current.bookmarks, path);
    if (bookmark === null) return;
    setDialog({
      kind: "bookmark-name",
      path: bookmark.path,
      name: bookmark.name,
    });
  }, []);

  const enqueueUploads = useCallback(
    (requests: readonly UploadRequest[]) => {
      if (requests.length === 0) return;
      uploads.enqueue(requests);
    },
    [uploads],
  );

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleRefresh = useCallback(() => {
    treeRef.current.refreshAll();
    refetchRef.current();
  }, []);

  const handleRowClick = useCallback(
    (entry: FileEntry, event: ReactMouseEvent<HTMLElement>) => {
      focusSurface();
      selectionRef.current.handleRowClick(entry.path, {
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
      });
    },
    [focusSurface],
  );

  const handleToggleSelect = useCallback((entry: FileEntry) => {
    selectionRef.current.toggle(entry.path);
  }, []);

  const handleToggleExpand = useCallback(
    (entry: FileEntry) => {
      focusSurface();
      selectionRef.current.setFocus(entry.path);
      treeRef.current.toggle(entry);
    },
    [focusSurface],
  );

  const handleRetryNode = useCallback((path: string) => {
    treeRef.current.reload(path);
  }, []);

  const handleCollapseAll = useCallback(() => {
    treeRef.current.collapseAll();
  }, []);

  const handleBackgroundClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("[data-fm-path]") !== null
      )
        return;
      selection.clear();
    },
    [selection],
  );

  const handleRowContextMenu = useCallback((entry: FileEntry) => {
    contextRowRef.current = entry.path;
    const current = selectionRef.current;
    if (!current.isSelected(entry.path)) current.select(entry.path);
  }, []);

  const handleContainerContextMenu = useCallback(() => {
    const path = contextRowRef.current;
    contextRowRef.current = null;
    setContextTarget(path);
  }, []);

  const menuEntries = useMemo(() => {
    if (contextTarget === null) return [];
    if (selection.selected.has(contextTarget) && selectedEntries.length > 0)
      return selectedEntries;
    const entry = entryByPath.get(contextTarget);
    return entry === undefined ? [] : [entry];
  }, [contextTarget, entryByPath, selectedEntries, selection.selected]);

  const openProperties = useCallback((entries: readonly FileEntry[]) => {
    setDialog(
      entries.length > 0
        ? {
            kind: "properties",
            target: { kind: "entries", entries: [...entries] },
          }
        : {
            kind: "properties",
            target: { kind: "path", path: currentPathRef.current },
          },
    );
  }, []);

  const dropTargetFor = useCallback((entry: FileEntry): string | null => {
    if (entry.escapesRoot) return null;
    if (effectiveKind(entry) === "directory") return entry.path;
    const row = rowByPathRef.current.get(entry.path);
    return row !== undefined && row.depth > 0 ? row.parentPath : null;
  }, []);

  const hoverExpandRef = useRef<{ path: string; timer: number } | null>(null);

  const clearHoverExpand = useCallback((path?: string) => {
    const pending = hoverExpandRef.current;
    if (pending === null) return;
    if (path !== undefined && pending.path !== path) return;
    window.clearTimeout(pending.timer);
    hoverExpandRef.current = null;
  }, []);

  const scheduleHoverExpand = useCallback(
    (entry: FileEntry) => {
      const row = rowByPathRef.current.get(entry.path);
      if (row === undefined || !row.expandable || row.expanded) {
        clearHoverExpand();
        return;
      }
      if (hoverExpandRef.current?.path === entry.path) return;
      clearHoverExpand();
      const path = entry.path;
      const timer = window.setTimeout(() => {
        hoverExpandRef.current = null;
        treeRef.current.expand(path);
      }, AUTO_EXPAND_HOVER_MS);
      hoverExpandRef.current = { path, timer };
    },
    [clearHoverExpand],
  );

  useEffect(() => () => clearHoverExpand(), [clearHoverExpand]);

  const handleRowDragStart = useCallback(
    (entry: FileEntry, event: ReactDragEvent<HTMLElement>) => {
      if (entry.escapesRoot) {
        event.preventDefault();
        return;
      }
      const current = selectionRef.current;
      let paths = topLevelPaths(current.selectedPaths);
      if (!current.isSelected(entry.path)) {
        current.select(entry.path);
        paths = [entry.path];
      }
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(DRAG_MIME, JSON.stringify(paths));
      event.dataTransfer.setData("text/plain", paths.join("\n"));
    },
    [],
  );

  const handleRowDragOver = useCallback(
    (entry: FileEntry, event: ReactDragEvent<HTMLElement>) => {
      const target = dropTargetFor(entry);
      if (target === null) return;
      const external = isExternalDrag(event);
      if (!external) {
        const dragged = selectionRef.current;
        if (dragged.isSelected(entry.path)) return;
        if (
          dragged.selectedPaths.some((path) => isSameOrDescendant(target, path))
        )
          return;
      }
      scheduleHoverExpand(entry);
      pendingDropTargetRef.current = target;
      event.preventDefault();
      event.dataTransfer.dropEffect = external ? "copy" : "move";
    },
    [dropTargetFor, scheduleHoverExpand],
  );

  const handleRowDragLeave = useCallback(
    (entry: FileEntry, event: ReactDragEvent<HTMLElement>) => {
      const related = event.relatedTarget;
      if (related instanceof Node && event.currentTarget.contains(related))
        return;
      clearHoverExpand(entry.path);
    },
    [clearHoverExpand],
  );

  const handleTargetDragOver = useCallback(
    (path: string, event: ReactDragEvent<HTMLElement>) => {
      pendingDropTargetRef.current = path;
      event.preventDefault();
      event.dataTransfer.dropEffect = isExternalDrag(event) ? "copy" : "move";
    },
    [],
  );

  const noopDragHandler = useCallback(() => undefined, []);

  const handleRootDragOver = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      const pending = pendingDropTargetRef.current;
      pendingDropTargetRef.current = null;
      const external = isExternalDrag(event);
      if (external) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setExternalDrag(true);
      }
      setDropTarget(pending ?? (external ? currentPathRef.current : null));
    },
    [],
  );

  const handleRootDragEnter = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      dragDepthRef.current += 1;
      if (isExternalDrag(event)) {
        event.preventDefault();
        setExternalDrag(true);
      }
    },
    [],
  );

  const handleRootDragLeave = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      const related = event.relatedTarget;
      if (related instanceof Node && event.currentTarget.contains(related))
        return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        clearHoverExpand();
        setExternalDrag(false);
        setDropTarget(null);
      }
    },
    [clearHoverExpand],
  );

  const handleRootDragEnd = useCallback(() => {
    dragDepthRef.current = 0;
    clearHoverExpand();
    setExternalDrag(false);
    setDropTarget(null);
  }, [clearHoverExpand]);

  const handleRootDrop = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      event.preventDefault();
      const pending = pendingDropTargetRef.current;
      pendingDropTargetRef.current = null;
      const destination = pending ?? dropTarget ?? currentPathRef.current;
      clearHoverExpand();
      dragDepthRef.current = 0;
      setExternalDrag(false);
      setDropTarget(null);

      if (isExternalDrag(event)) {
        const entries = snapshotDropEntries(event.dataTransfer);
        if (entries === null) {
          const files = Array.from(event.dataTransfer.files);
          if (files.length === 0) return;
          toast.message(messagesNow(messages).folderUploadUnsupported);
          enqueueUploads(
            files.map((file) => ({
              file,
              dirPath: destination,
              relativeDir: "",
            })),
          );
          return;
        }
        void (async () => {
          const collected: { file: File; relativeDir: string }[] = [];
          for (const entry of entries)
            await walkDropEntry(entry, "", collected);
          enqueueUploads(
            collected.map((item) => ({
              file: item.file,
              dirPath: destination,
              relativeDir: item.relativeDir,
            })),
          );
        })();
        return;
      }

      const paths = readDraggedPaths(event.dataTransfer);
      if (paths.length === 0) return;
      moveTo(paths, destination);
    },
    [clearHoverExpand, dropTarget, enqueueUploads, moveTo],
  );

  const rowElement = useCallback((path: string | null): HTMLElement | null => {
    const container = scrollRef.current;
    if (path === null || container === null) return null;
    const escaped = path.replace(/["\\]/gu, "\\$&");
    const row = container.querySelector(`[data-fm-path="${escaped}"]`);
    return row instanceof HTMLElement ? row : null;
  }, []);

  const focusRow = useCallback(
    (path: string | null) => {
      rowElement(path)?.scrollIntoView({ block: "nearest" });
    },
    [rowElement],
  );

  const openKeyboardContextMenu = useCallback(
    (path: string | null) => {
      const container = scrollRef.current;
      if (container === null) return;
      const target = rowElement(path) ?? container;
      const rect = target.getBoundingClientRect();
      target.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: Math.round(rect.left + 8),
          clientY: Math.round(rect.top + rect.height / 2),
        }),
      );
    },
    [rowElement],
  );

  useEffect(() => {
    focusRow(selection.focus);
  }, [focusRow, selection.focus]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const panel = rootRef.current;
      if (
        panel !== null &&
        event.target instanceof Node &&
        !panel.contains(event.target)
      )
        return;
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        !event.altKey &&
        (event.key === "l" || event.key === "L")
      ) {
        event.preventDefault();
        openPathBar();
        return;
      }
      if (isTypingTarget(event.target)) return;
      const mod = event.ctrlKey || event.metaKey;
      const focusedRow =
        selection.focus === null ? undefined : rowByPath.get(selection.focus);
      const focusedEntry =
        selection.focus === null ? undefined : entryByPath.get(selection.focus);

      if (mod && event.shiftKey && (event.key === "." || event.key === ">")) {
        event.preventDefault();
        toggleHidden();
        return;
      }
      if (mod && event.shiftKey && (event.key === "N" || event.key === "n")) {
        event.preventDefault();
        if (writable) setDialog({ kind: "new-folder" });
        return;
      }
      if (
        !mod &&
        (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))
      ) {
        event.preventDefault();
        openKeyboardContextMenu(selection.focus);
        return;
      }
      if (event.altKey && !mod && !event.shiftKey && event.key === "Enter") {
        event.preventDefault();
        openProperties(selectedEntries);
        return;
      }
      if (mod && !event.shiftKey) {
        switch (event.key) {
          case "a":
          case "A":
            event.preventDefault();
            selection.selectAll();
            return;
          case "x":
          case "X":
            event.preventDefault();
            clipboard.cut(topLevelPaths(selection.selectedPaths));
            return;
          case "c":
          case "C":
            event.preventDefault();
            clipboard.copy(topLevelPaths(selection.selectedPaths));
            return;
          case "v":
          case "V":
            event.preventDefault();
            paste();
            return;
          case "f":
          case "F":
            event.preventDefault();
            if (inlineChrome && !searchOpenRef.current) {
              setSearchOpen(true);
              return;
            }
            searchRef.current?.focus();
            searchRef.current?.select();
            return;
          default:
            break;
        }
        return;
      }

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          selection.moveFocus(1, event.shiftKey);
          return;
        case "ArrowUp":
          event.preventDefault();
          selection.moveFocus(-1, event.shiftKey);
          return;
        case "Home":
          event.preventDefault();
          selection.focusEdge("start", event.shiftKey);
          return;
        case "End":
          event.preventDefault();
          selection.focusEdge("end", event.shiftKey);
          return;
        case "Enter":
          if (focusedEntry !== undefined) {
            event.preventDefault();
            openEntry(focusedEntry);
          }
          return;
        case " ": {
          if (isActivationTarget(event.target)) return;
          if (focusedEntry === undefined) return;
          event.preventDefault();
          if (!isViewableEntry(focusedEntry)) return;
          showEntry(focusedEntry);
          return;
        }
        case "Backspace":
          event.preventDefault();
          goToParent();
          return;
        case "ArrowRight": {
          if (event.altKey) return;
          if (galleryView) {
            event.preventDefault();
            selection.moveFocus(1, event.shiftKey);
            return;
          }
          if (focusedRow === undefined || !focusedRow.expandable) return;
          if (!focusedRow.expanded) {
            event.preventDefault();
            tree.expand(focusedRow.entry.path);
            return;
          }
          const index = rows.indexOf(focusedRow);
          const next = index < 0 ? undefined : rows[index + 1];
          if (
            next?.kind === "entry" &&
            isSamePath(next.parentPath, focusedRow.entry.path)
          ) {
            event.preventDefault();
            selection.moveFocus(1);
          }
          return;
        }
        case "ArrowLeft":
          if (event.altKey) {
            event.preventDefault();
            goToParent();
            return;
          }
          if (galleryView) {
            event.preventDefault();
            selection.moveFocus(-1, event.shiftKey);
            return;
          }
          if (focusedRow === undefined) return;
          if (focusedRow.expandable && focusedRow.expanded) {
            event.preventDefault();
            tree.collapse(focusedRow.entry.path);
            return;
          }
          if (focusedRow.depth > 0) {
            event.preventDefault();
            selection.select(focusedRow.parentPath);
          }
          return;
        case "F2":
          if (
            selectedEntries.length === 1 &&
            selectedEntries[0] !== undefined
          ) {
            event.preventDefault();
            setDialog({ kind: "rename", entry: selectedEntries[0] });
          }
          return;
        case "Delete":
          if (selectedEntries.length > 0) {
            event.preventDefault();
            requestDelete(selectedEntries);
          }
          return;
        case "Escape":
          if (selection.count > 0) {
            event.preventDefault();
            selection.clear();
          }
          return;
        default:
          return;
      }
    },
    [
      clipboard,
      entryByPath,
      galleryView,
      goToParent,
      openEntry,
      openKeyboardContextMenu,
      openPathBar,
      openProperties,
      paste,
      showEntry,
      inlineChrome,
      requestDelete,
      rowByPath,
      rows,
      selectedEntries,
      selection,
      toggleHidden,
      tree,
      writable,
    ],
  );

  const snapshot: PanelSnapshot = useMemo(
    () => ({
      currentPath,
      writable,
      ready: listingEnabled,
      showHidden,
      selectionCount: selection.count,
      canPaste,
    }),
    [
      canPaste,
      currentPath,
      listingEnabled,
      selection.count,
      showHidden,
      writable,
    ],
  );

  useEffect(() => {
    if (inlineChrome) return;
    publishPanelSnapshot(snapshot);
  }, [inlineChrome, snapshot]);

  useEffect(() => {
    if (inlineChrome) return;
    return resetPanelSnapshot;
  }, [inlineChrome]);

  const commandRef = useRef<(command: PanelCommand) => void>(() => undefined);
  commandRef.current = (command) => {
    switch (command.type) {
      case "upload":
        openFilePicker();
        return;
      case "new-folder":
        setDialog({ kind: "new-folder" });
        return;
      case "refresh":
        treeRef.current.refreshAll();
        refetchRef.current();
        return;
      case "toggle-hidden":
        toggleHidden();
        return;
      case "select-all":
        selection.selectAll();
        return;
      case "paste":
        paste();
        return;
      case "copy-path":
        copyPathsToClipboard([currentPathRef.current]);
        return;
      case "set-start-folder":
        setStartFolder(currentPathRef.current);
        return;
      case "collapse-all":
        handleCollapseAll();
        return;
      default:
        return;
    }
  };

  const runCommand = useCallback((command: PanelCommand) => {
    commandRef.current(command);
  }, []);

  const handleSearchOpenChange = useCallback(
    (open: boolean) => {
      setSearchOpen(open);
      if (open) {
        closePathBar(false);
        return;
      }
      setQuery("");
      focusSurface();
    },
    [closePathBar, focusSurface],
  );

  useEffect(() => {
    if (!searchOpen) return;
    searchRef.current?.focus();
    searchRef.current?.select();
  }, [searchOpen]);

  useEffect(() => {
    if (inlineChrome) return;
    return subscribePanelCommands((command) => {
      commandRef.current(command);
    });
  }, [inlineChrome]);

  const emptyKind: EmptyStateKind =
    query.trim() !== ""
      ? "no-results"
      : directory.error?.code === "path_escape"
        ? "escapes-root"
        : writable
          ? "empty"
          : "not-writable";

  const hiddenCount = directory.data?.hiddenCount ?? 0;
  const truncated = directory.data?.truncated ?? false;

  const currentBookmarked = bookmarks.isBookmarked(currentPath);
  const canToggleCurrentBookmark = listingEnabled && !bookmarks.loading;
  const rowMenuEntry = menuEntries.length === 1 ? menuEntries[0] : undefined;
  const rowMenuBookmarked =
    rowMenuEntry !== undefined && bookmarks.isBookmarked(rowMenuEntry.path);
  const selectedActionEntry =
    selectedEntries.length === 1 ? selectedEntries[0] : undefined;
  const selectedActionBookmarked =
    selectedActionEntry !== undefined &&
    bookmarks.isBookmarked(selectedActionEntry.path);
  const actionPropsFor = (
    entries: readonly FileEntry[],
    bookmarked: boolean,
  ): SelectedEntryActionsProps => ({
    entries,
    writable,
    canPaste,
    canExtract:
      entries.length === 1 &&
      entries[0]?.archiveFormat != null &&
      isFormatSupported(entries[0].archiveFormat, archiveSupport),
    onOpen: openEntry,
    onDownload: () => downloadSelection(entries),
    onAddToChat: () => addToChat(entries),
    onExtract: (entry) => setDialog({ kind: "extract", entry }),
    onCut: () =>
      clipboard.cut(topLevelPaths(entries.map((entry) => entry.path))),
    onCopy: () =>
      clipboard.copy(topLevelPaths(entries.map((entry) => entry.path))),
    onPaste: paste,
    onMoveTo: () =>
      setDialog({
        kind: "picker",
        mode: "move",
        paths: entries.map((entry) => entry.path),
      }),
    onCopyTo: () =>
      setDialog({
        kind: "picker",
        mode: "copy",
        paths: entries.map((entry) => entry.path),
      }),
    onRename: (entry) => setDialog({ kind: "rename", entry }),
    onCopyPath: () => copyPathsToClipboard(entries.map((entry) => entry.path)),
    onDelete: () => requestDelete(entries),
    onSetStartFolder: (entry) => setStartFolder(entry.path),
    onProperties: () => openProperties(entries),
    bookmarked,
    canToggleBookmark: !bookmarks.loading,
    onToggleBookmark: (entry) => toggleBookmark(entry.path),
  });
  const selectedActionProps = actionPropsFor(
    selectedEntries,
    selectedActionBookmarked,
  );
  const rowMenuActionProps = actionPropsFor(menuEntries, rowMenuBookmarked);
  const bookmarkItems = {
    bookmarks: bookmarks.bookmarks,
    currentBookmarked,
    ready: canToggleCurrentBookmark,
    onNavigate: navigateTo,
    onToggleCurrent: () => toggleBookmark(currentPath),
    onRenameCurrent: () => openBookmarkRename(currentPath),
    onRemove: removeBookmark,
    onRefresh: bookmarks.refresh,
  };
  const surfaceLoading = directory.isLoading || !ready || redirectPending;
  const cutPaths =
    clipboard.clipboard?.mode === "cut"
      ? new Set(clipboard.clipboard.paths)
      : new Set<string>();
  const handleParentDragOver = (event: ReactDragEvent<HTMLElement>): void => {
    if (parentPath !== null) handleTargetDragOver(parentPath, event);
  };
  const emptyStateNode = (
    <EmptyState
      kind={emptyKind}
      query={query}
      root={root}
      onClearSearch={() => setQuery("")}
      onNewFolder={
        writable ? () => setDialog({ kind: "new-folder" }) : undefined
      }
      onUpload={writable ? openFilePicker : undefined}
    />
  );

  return (
    <div
      ref={rootRef}
      data-testid="fm-panel"
      data-current-path={currentPath}
      className="@container relative flex h-full min-h-0 flex-1 flex-col bg-background text-foreground outline-none"
      onKeyDown={handleKeyDown}
      onDragEnter={handleRootDragEnter}
      onDragOver={handleRootDragOver}
      onDragLeave={handleRootDragLeave}
      onDragEnd={handleRootDragEnd}
      onDrop={handleRootDrop}
    >
      <Toolbar
        variant={inlineChrome ? "compact" : "wide"}
        searchOpen={searchOpen}
        onSearchOpenChange={handleSearchOpenChange}
        actions={
          inlineChrome ? (
            <PanelActions
              ready={listingEnabled}
              writable={writable}
              canPaste={canPaste}
              showHidden={showHidden}
              sortField={sortField}
              sortDirection={sortDirection}
              viewMode={viewMode}
              expandedCount={tree.expandedCount}
              bookmarks={<BookmarkMenuItems {...bookmarkItems} />}
              onCommand={runCommand}
              onSortFieldChange={applySortField}
              onSortDirectionChange={applySortDirection}
              threadFolder={threadFolder}
              onViewModeChange={applyViewMode}
            />
          ) : null
        }
        path={currentPath}
        root={root}
        onNavigate={navigateTo}
        query={query}
        onQueryChange={setQuery}
        searchInputRef={searchRef}
        sortField={sortField}
        sortDirection={sortDirection}
        onSortFieldChange={applySortField}
        onSortDirectionChange={applySortDirection}
        viewMode={viewMode}
        onViewModeChange={applyViewMode}
        showHidden={showHidden}
        onToggleHidden={toggleHidden}
        expandedCount={tree.expandedCount}
        onCollapseAll={handleCollapseAll}
        onRefresh={handleRefresh}
        refreshing={directory.isRefetching}
        hiddenCount={hiddenCount}
        bookmarked={currentBookmarked}
        canToggleBookmark={canToggleCurrentBookmark}
        onToggleBookmark={() => toggleBookmark(currentPath)}
        bookmarksMenu={<BookmarksMenu {...bookmarkItems} />}
        volume={directory.data?.volume ?? null}
        dropTargetPath={dropTarget}
        onDragOverCrumb={handleTargetDragOver}
        onDragLeaveCrumb={noopDragHandler}
        onDropOnCrumb={noopDragHandler}
        pathEditing={pathEditing}
        onPathOpen={openPathBar}
        onPathCancel={handlePathCancel}
        onPathSubmit={submitPath}
        pathError={pathError}
        onPathDirty={handlePathDirty}
        pathBusy={pathBusy}
        pathFocusTick={pathFocusTick}
      />

      {selectionBarEnabled && selectedEntries.length > 0 ? (
        <SelectionActionBar
          {...selectedActionProps}
          onClear={selection.clear}
        />
      ) : null}

      {stateError === null ? null : (
        <ErrorBanner
          error={stateError}
          title={t.backendSilent}
          onRetry={() => {
            setReady(false);
            setStateError(null);
            window.setTimeout(() => setReady(true), 0);
          }}
        />
      )}

      {}
      {directory.error === null ||
      restoreFallbackMoves ||
      directory.error === swallowedError ? null : (
        <ErrorBanner
          error={directory.error.rawMessage}
          title={t.folderOpenFailed}
          onRetry={handleRefresh}
        />
      )}

      {truncated ? (
        <div className="flex items-center gap-2 border-b border-border bg-surface-attention px-3 py-1.5 text-xs text-warning-text">
          {t.listingTruncated(
            state?.maxListEntries ?? directory.entries.length,
            directory.data?.totalEntries ?? 0,
          )}
        </div>
      ) : null}

      {}
      {tree.rowsTruncated && !galleryView ? (
        <div className="flex items-center gap-2 border-b border-border bg-surface-attention px-3 py-1.5 text-xs text-warning-text">
          {t.treeTruncated(MAX_TREE_ROWS)}
        </div>
      ) : null}

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={scrollRef}
            data-testid="fm-scroll"
            className="min-h-0 flex-1 overflow-auto"
            onClick={handleBackgroundClick}
            onContextMenu={handleContainerContextMenu}
          >
            {}
            {galleryView ? (
              <FileGallery
                gridRef={galleryRef}
                entries={galleryEntries}
                loading={surfaceLoading}
                selectedPaths={selection.selected}
                focusedPath={selection.focus}
                cutPaths={cutPaths}
                dragEnabled={rowDragEnabled}
                dropTargetPath={dropTarget}
                previewBaseUrl={previewBaseUrl}
                parentPath={parentPath}
                onNavigateParent={goToParent}
                onRowClick={handleRowClick}
                onRowDoubleClick={openEntry}
                onRowContextMenu={handleRowContextMenu}
                onToggleSelect={handleToggleSelect}
                onRowDragStart={handleRowDragStart}
                onRowDragOver={handleRowDragOver}
                onRowDragLeave={handleRowDragLeave}
                onRowDrop={noopDragHandler}
                onRowDragEnd={handleRootDragEnd}
                onParentDragOver={handleParentDragOver}
                onParentDragLeave={noopDragHandler}
                onParentDrop={noopDragHandler}
                emptyState={emptyStateNode}
              />
            ) : (
              <FileTable
                gridRef={gridRef}
                rows={rows}
                loading={surfaceLoading}
                selectedPaths={selection.selected}
                focusedPath={selection.focus}
                cutPaths={cutPaths}
                dragEnabled={rowDragEnabled}
                sortField={sortField}
                sortDirection={sortDirection}
                onSort={handleHeaderSort}
                parentPath={parentPath}
                onNavigateParent={goToParent}
                dropTargetPath={dropTarget}
                nowMs={nowMs}
                onSelectAll={(selectAll) => {
                  if (selectAll) selection.selectAll();
                  else selection.clear();
                }}
                onToggleExpand={handleToggleExpand}
                onRetryNode={handleRetryNode}
                onRowClick={handleRowClick}
                onRowDoubleClick={openEntry}
                onRowContextMenu={handleRowContextMenu}
                onToggleSelect={handleToggleSelect}
                onRowDragStart={handleRowDragStart}
                onRowDragOver={handleRowDragOver}
                onRowDragLeave={handleRowDragLeave}
                onRowDrop={noopDragHandler}
                onRowDragEnd={handleRootDragEnd}
                onParentDragOver={handleParentDragOver}
                onParentDragLeave={noopDragHandler}
                onParentDrop={noopDragHandler}
                emptyState={emptyStateNode}
              />
            )}
          </div>
        </ContextMenuTrigger>

        {menuEntries.length > 0 ? (
          <RowContextMenu {...rowMenuActionProps} />
        ) : (
          <BackgroundContextMenu
            writable={writable}
            canPaste={canPaste}
            showHidden={showHidden}
            onNewFolder={() => setDialog({ kind: "new-folder" })}
            onUpload={openFilePicker}
            onPaste={paste}
            onSelectAll={() => selection.selectAll()}
            onRefresh={handleRefresh}
            onToggleHidden={toggleHidden}
            expandedCount={tree.expandedCount}
            onCollapseAll={handleCollapseAll}
            onCopyPath={() => copyPathsToClipboard([currentPath])}
            onSetStartFolder={() => setStartFolder(currentPath)}
            onProperties={() => openProperties([])}
            bookmarked={currentBookmarked}
            canToggleBookmark={canToggleCurrentBookmark}
            onToggleBookmark={() => toggleBookmark(currentPath)}
          />
        )}
      </ContextMenu>

      <ActivityTray
        uploads={uploads.uploads}
        jobs={jobs.jobs}
        onCancelUpload={uploads.cancel}
        onRetryUpload={uploads.retry}
        onDismissUpload={uploads.remove}
        onClearFinished={() => {
          uploads.clearFinished();
          jobs.clearFinished();
        }}
        onCancelJob={(jobId) => {
          void jobs.cancel(jobId).catch((failure: unknown) => {
            toast.error(
              errorToastText(failure, messagesNow(messages).cancelJobFailed),
            );
          });
        }}
        onDismissJob={jobs.dismiss}
      />

      {externalDrag ? (
        <div
          data-testid="fm-drop-overlay"
          className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-inset ring-primary/50"
        />
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        data-testid="fm-file-input"
        onChange={(event) => {
          const files = event.target.files;
          if (files !== null) {
            enqueueUploads(
              Array.from(files).map((file) => ({
                file,
                dirPath: currentPathRef.current,
                relativeDir: "",
              })),
            );
          }
          event.target.value = "";
        }}
      />

      {dialog.kind === "new-folder" ? (
        <NewFolderDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialog({ kind: "none" });
          }}
          existingNames={existingNames}
          destinationLabel={currentPath}
          onSubmit={async (name) => {
            await rpc.call("createFolder", { path: currentPath, name });
            refetchRef.current();
          }}
        />
      ) : null}

      {dialog.kind === "rename" ? (
        <RenameDialog
          open
          entry={dialog.entry}
          existingNames={siblingNames(dialog.entry.path)}
          onOpenChange={(open) => {
            if (!open) setDialog({ kind: "none" });
          }}
          onSubmit={async (entry, newName) => {
            const result = await rpc.call("renameEntry", {
              path: entry.path,
              newName,
            });
            treeRef.current.remapPrefix(entry.path, result.entry.path);
            refetchRef.current();
          }}
        />
      ) : null}

      {dialog.kind === "delete" ? (
        <ConfirmDeleteDialog
          open
          entries={dialog.entries}
          onOpenChange={(open) => {
            if (!open) setDialog({ kind: "none" });
          }}
          onConfirm={deleteEntries}
        />
      ) : null}

      {dialog.kind === "extract" ? (
        <ExtractDialog
          open
          entry={dialog.entry}
          root={root}
          showHidden={showHidden}
          archiveSupport={archiveSupport}
          onOpenChange={(open) => {
            if (!open) setDialog({ kind: "none" });
          }}
          onSubmit={startExtract}
        />
      ) : null}

      {dialog.kind === "bookmark-name" ? (
        <BookmarkNameDialog
          open
          initialName={dialog.name}
          pathLabel={dialog.path}
          onOpenChange={(open) => {
            if (!open) setDialog({ kind: "none" });
          }}
          onSubmit={async (name) => {
            await bookmarksRef.current
              .rename(dialog.path, name)
              .catch((failure: unknown) => {
                throw new Error(
                  errorToastText(
                    failure,
                    messagesNow(bookmarkMessages).renameFailed,
                  ),
                );
              });
          }}
        />
      ) : null}

      {dialog.kind === "view" ? (
        <FileViewerDialog
          open
          entry={dialog.entry}
          onOpenChange={(open) => {
            if (!open) setDialog({ kind: "none" });
          }}
          onExtract={(entry) => setDialog({ kind: "extract", entry })}
        />
      ) : null}

      {dialog.kind === "properties" ? (
        <PropertiesDialog
          open
          target={dialog.target}
          onOpenChange={(open) => {
            if (!open) setDialog({ kind: "none" });
          }}
        />
      ) : null}

      {dialog.kind === "picker" ? (
        <FolderPickerDialog
          open
          title={dialog.mode === "move" ? t.moveTo : t.copyTo}
          initialPath={currentPath}
          root={root}
          showHidden={showHidden}
          confirmLabel={t.chooseFolder}
          onOpenChange={(open) => {
            if (!open) setDialog({ kind: "none" });
          }}
          onChoose={(destination) => {
            if (dialog.mode === "move") moveTo(dialog.paths, destination);
            else copyTo(dialog.paths, destination);
          }}
        />
      ) : null}

      {dialog.kind === "conflict" ? (
        <ConflictDialog
          open
          conflicts={dialog.conflicts}
          destinationDir={dialog.destinationDir}
          operation={dialog.operation === "move" ? t.move : t.copy}
          onOpenChange={(open) => {
            if (!open) setDialog({ kind: "none" });
          }}
          onResolve={(choice: ConflictChoice) => {
            if (choice === "skip") {
              refetchRef.current();
              return;
            }
            const conflictPolicy =
              choice === "overwrite" ? "overwrite" : "rename";
            const { operation, destinationDir, paths } = dialog;
            void (async () => {
              try {
                const result =
                  operation === "move"
                    ? await rpc.call("moveEntries", {
                        paths,
                        destinationDir,
                        conflict: conflictPolicy,
                      })
                    : await rpc.call("copyEntries", {
                        paths,
                        destinationDir,
                        conflict: conflictPolicy,
                      });
                applyBatch(result, operation);
              } catch (failure) {
                toast.error(
                  errorToastText(failure, messagesNow(messages).finishFailed),
                );
              }
            })();
          }}
        />
      ) : null}
    </div>
  );
}

export function FileManagerPanel({ subPath }: PluginNavPanelProps) {
  const location = useRouteLocation(subPath);
  return <FileManagerSurface location={location} chrome="host-header" />;
}
