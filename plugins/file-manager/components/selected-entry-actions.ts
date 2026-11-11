import type { FileEntry } from "../contract";
import { isViewableEntry } from "../lib/viewer";
import { effectiveKind } from "./FileRow";
import type { IconName } from "@/components/ui/icon";
import { actionMessages } from "./action-messages";
import { messagesNow } from "../lib/i18n";

export interface SelectedEntryActionsProps {
  entries: readonly FileEntry[];
  writable: boolean;
  canPaste: boolean;
  canExtract: boolean;
  onOpen: (entry: FileEntry) => void;
  onDownload: () => void;
  onAddToChat: () => void;
  onExtract: (entry: FileEntry) => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onMoveTo: () => void;
  onCopyTo: () => void;
  onRename: (entry: FileEntry) => void;
  onCopyPath: () => void;
  onDelete: () => void;
  onSetStartFolder: (entry: FileEntry) => void;
  onProperties: () => void;
  bookmarked: boolean;
  canToggleBookmark: boolean;
  onToggleBookmark: (entry: FileEntry) => void;
}

export type SelectedEntryActionId =
  | "open"
  | "download"
  | "add-to-chat"
  | "extract"
  | "cut"
  | "copy"
  | "paste"
  | "move-to"
  | "copy-to"
  | "rename"
  | "copy-path"
  | "set-start-folder"
  | "bookmark"
  | "properties"
  | "delete";

export interface SelectedEntryAction {
  id: SelectedEntryActionId;
  label: string;
  icon: IconName;
  disabled: boolean;
  destructive?: boolean;
  trailing?: string;
  shortcut?: string;
  run: () => void;
}

export interface SelectedEntryActionModel {
  label: string;
  groups: readonly (readonly SelectedEntryAction[])[];
}

export function selectedEntryActionModel(
  props: SelectedEntryActionsProps,
): SelectedEntryActionModel {
  const {
    entries,
    writable,
    canPaste,
    canExtract,
    bookmarked,
    canToggleBookmark,
  } = props;
  const t = messagesNow(actionMessages);
  const single = entries.length === 1 ? entries[0] : undefined;
  const directory =
    single !== undefined && effectiveKind(single) === "directory";
  const escapes = entries.some((entry) => entry.escapesRoot);
  const files = entries.filter(
    (entry) => !entry.escapesRoot && effectiveKind(entry) === "file",
  );
  const downloadable = entries.filter((entry) => {
    const kind = effectiveKind(entry);
    return !entry.escapesRoot && (kind === "file" || kind === "directory");
  });
  const archive =
    single !== undefined && single.archiveFormat !== null ? single : undefined;
  const folderAction = single !== undefined && directory && !escapes;
  const openable =
    single !== undefined && !escapes && (directory || isViewableEntry(single))
      ? single
      : undefined;

  const transfer: SelectedEntryAction[] = [];
  if (openable !== undefined) {
    transfer.push({
      id: "open",
      label: t.open,
      icon: directory
        ? "FolderOpen"
        : openable.archiveFormat !== null
          ? "ArchiveRestore"
          : "Eye",
      disabled: false,
      shortcut: "Enter",
      run: () => props.onOpen(openable),
    });
  }
  transfer.push(
    {
      id: "download",
      label:
        downloadable.length === 1 && files.length === 1
          ? t.download
          : t.downloadZip,
      icon: "Download",
      disabled: downloadable.length === 0,
      trailing:
        downloadable.length > 1 ? String(downloadable.length) : undefined,
      run: props.onDownload,
    },
    {
      id: "add-to-chat",
      label: t.addToChat,
      icon: "MessageSquarePlus",
      disabled: files.length === 0,
      trailing: files.length > 1 ? String(files.length) : undefined,
      run: props.onAddToChat,
    },
  );
  if (archive !== undefined) {
    transfer.push({
      id: "extract",
      label: t.extract,
      icon: "ArchiveRestore",
      disabled: !canExtract || !writable,
      run: () => props.onExtract(archive),
    });
  }

  const organize: SelectedEntryAction[] = [
    {
      id: "cut",
      label: t.cut,
      icon: "Layers",
      disabled: escapes,
      shortcut: "Ctrl+X",
      run: props.onCut,
    },
    {
      id: "copy",
      label: t.copy,
      icon: "Copy",
      disabled: escapes,
      shortcut: "Ctrl+C",
      run: props.onCopy,
    },
    {
      id: "paste",
      label: t.paste,
      icon: "PackageReceive",
      disabled: !canPaste || !writable,
      shortcut: "Ctrl+V",
      run: props.onPaste,
    },
  ];
  const destinations: SelectedEntryAction[] = [
    {
      id: "move-to",
      label: t.moveTo,
      icon: "FolderExport",
      disabled: escapes,
      run: props.onMoveTo,
    },
    {
      id: "copy-to",
      label: t.copyTo,
      icon: "Folder",
      disabled: escapes,
      run: props.onCopyTo,
    },
  ];
  const details: SelectedEntryAction[] = [
    {
      id: "rename",
      label: t.rename,
      icon: "Edit",
      disabled: single === undefined || !writable,
      shortcut: "F2",
      run: () => {
        if (single !== undefined) props.onRename(single);
      },
    },
    {
      id: "copy-path",
      label: t.copyPath,
      icon: "Paperclip",
      disabled: false,
      run: props.onCopyPath,
    },
  ];
  if (folderAction) {
    details.push(
      {
        id: "set-start-folder",
        label: t.setStartFolder,
        icon: "Pin",
        disabled: false,
        run: () => props.onSetStartFolder(single),
      },
      {
        id: "bookmark",
        label: bookmarked ? t.removeBookmark : t.bookmark,
        icon: bookmarked ? "PinOff" : "Star",
        disabled: !canToggleBookmark,
        run: () => props.onToggleBookmark(single),
      },
    );
  }
  details.push({
    id: "properties",
    label: t.properties,
    icon: "Info",
    disabled: false,
    shortcut: "Alt+Enter",
    run: props.onProperties,
  });

  return {
    label: single === undefined ? t.items(entries.length) : single.name,
    groups: [
      transfer,
      organize,
      destinations,
      details,
      [
        {
          id: "delete",
          label: t.delete,
          icon: "Trash2",
          disabled: !writable,
          destructive: true,
          shortcut: "Del",
          run: props.onDelete,
        },
      ],
    ],
  };
}
