import type { ExperimentalBadge } from "@get-bb/plugin-sdk/app";

import { formatPercent } from "../lib/format";
import { defineMessages, pluralRu, useMessages } from "../lib/i18n";
import { useUploads } from "./useUploads";

const messages = defineMessages(
  {
    inProgress: (count: number) =>
      `${String(count)} upload${count === 1 ? "" : "s"} in progress`,
    uploading: (count: number, percent: string) =>
      `${String(count)} uploading — ${percent}`,
  },
  {
    inProgress: (count) =>
      `${pluralRu(count, ["Идёт", "Идут", "Идёт"])} ${String(count)} ${pluralRu(count, ["загрузка", "загрузки", "загрузок"])}`,
    uploading: (count, percent) =>
      `${pluralRu(count, ["Загружается", "Загружаются", "Загружаются"])} ${String(count)} — ${percent}`,
  },
);

export function useUploadBadge(): ExperimentalBadge | null {
  const t = useMessages(messages);
  const { activeCount, progress } = useUploads();
  if (activeCount === 0) return null;
  return {
    count: activeCount,
    label:
      progress === null
        ? t.inProgress(activeCount)
        : t.uploading(activeCount, formatPercent(progress.ratio)),
  };
}
