import type { PluginComposerApi } from "@get-bb/plugin-sdk/app";

import { MENTION_PROVIDER_ID, type FileEntry } from "../contract";

export function addFileMentions(
  composer: PluginComposerApi,
  files: readonly Pick<FileEntry, "name" | "path">[],
): void {
  if (files.length === 0) return;
  const text = composer.text;
  const lead = text.length === 0 || /\s$/u.test(text) ? [] : [" "];
  composer.insert(
    [
      ...lead,
      ...files.flatMap((file) => [
        { provider: MENTION_PROVIDER_ID, id: file.path, label: file.name },
        " ",
      ]),
    ],
    { at: "end" },
  );
  composer.focus();
}
