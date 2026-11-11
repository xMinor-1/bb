import { definePluginApp } from "@get-bb/plugin-sdk/app";

import { LOCATION_OPENER_EXTENSIONS, PANEL_PATH } from "./contract";
import { composerScopeKey, requestFilePick } from "./lib/composer-bus";
import { ComposerFilePicker } from "./components/ComposerFilePicker";
import { FileManagerPanel } from "./components/FileManagerPanel";
import {
  FileLocationOpener,
  FilePreviewOpener,
} from "./components/FileLocationOpener";
import {
  FileManagerNewThreadTab,
  FileManagerTab,
} from "./components/FileManagerTab";
import { HeaderActions } from "./components/HeaderActions";
import { SettingsSection } from "./components/SettingsSection";
import { useUploadBadge } from "./hooks/useUploadBadge";
import { defineMessages, messagesNow } from "./lib/i18n";

const messages = defineMessages(
  {
    fileManager: "File Manager",
    startFolder: "Start folder",
    startFolderDescription: "Pick the folder the File Manager panel opens in.",
    previewLocation: "Preview + location",
    fileLocation: "File location",
    fromFileManager: "From File Manager…",
    attachDescription: "Attach a file from the machine bb runs on.",
  },
  {
    fileManager: "Файловый менеджер",
    startFolder: "Стартовая папка",
    startFolderDescription:
      "Папка, в которой открывается панель файлового менеджера.",
    previewLocation: "Просмотр и расположение",
    fileLocation: "Расположение файла",
    fromFileManager: "Из файлового менеджера…",
    attachDescription: "Прикрепить файл с машины, на которой работает bb.",
  },
);

export default definePluginApp((app) => {
  const t = messagesNow(messages);
  app.slots.navPanel({
    id: "file-manager",
    title: t.fileManager,
    icon: "FolderOpen",
    path: PANEL_PATH,
    component: FileManagerPanel,
    headerContent: HeaderActions,
    experimental_useBadge: useUploadBadge,
  });

  app.slots.settingsSection({
    id: "start-folder",
    title: t.startFolder,
    description: t.startFolderDescription,
    component: SettingsSection,
  });

  app.slots.experimental_tab({
    context: { kind: "thread" },
    availability: "action",
    id: "file-manager",
    title: t.fileManager,
    icon: "FolderOpen",
    layout: "flush",
    component: FileManagerTab,
  });

  app.slots.experimental_newThreadPanelAction({
    id: "file-manager",
    title: t.fileManager,
    icon: "FolderOpen",
    layout: "flush",
    component: FileManagerNewThreadTab,
  });

  app.slots.fileOpener({
    id: "preview",
    title: t.previewLocation,
    extensions: [...LOCATION_OPENER_EXTENSIONS],
    component: FilePreviewOpener,
  });

  app.slots.fileOpener({
    id: "location",
    title: t.fileLocation,
    extensions: [...LOCATION_OPENER_EXTENSIONS],
    component: FileLocationOpener,
  });

  app.composer.customize({
    id: "add-file",
    plusMenu: [
      {
        id: "file-manager-pick",
        label: t.fromFileManager,
        icon: "FolderOpen",
        description: t.attachDescription,
        run: ({ composer }) => {
          requestFilePick(composerScopeKey(composer.scope));
        },
      },
    ],
    banners: [
      { id: "file-picker", chrome: "bare", component: ComposerFilePicker },
    ],
  });
});
