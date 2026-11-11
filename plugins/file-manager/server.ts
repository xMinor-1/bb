import type { BbPluginApi } from "@get-bb/plugin-sdk";

export { fileManagerContract } from "./contract";

import { registerMentions } from "./src/mentions";
import { createBookmarks } from "./src/bookmarks";
import { registerRpc, type ArchiveSupport } from "./src/rpc";
import { createSettings } from "./src/settings";
import { getRoot, initRoot } from "./src/root";

import { createArchives } from "./src/archives";
import { createJobs } from "./src/jobs";
import { createUploads } from "./src/uploads";
import { registerHttpRoutes } from "./src/http-routes";

export const PLUGIN_VERSION = "0.11.0";
export const PLUGIN_NAME = "File Manager";

const UPLOAD_GC_CRON = "17 * * * *";
const UPLOAD_GC_NAME = "upload-gc";

export default async function plugin(bb: BbPluginApi): Promise<void> {
  const root = await initRoot();
  const settings = await createSettings(bb);
  const bookmarks = createBookmarks(bb);

  const jobs = createJobs(bb);
  const archives = await createArchives(bb, { jobs, settings });
  const uploads = await createUploads(bb, { settings });
  const archiveSupport: ArchiveSupport = archives.support;

  registerHttpRoutes(bb, { uploads });
  bb.background.schedule(UPLOAD_GC_NAME, UPLOAD_GC_CRON, async () => {
    const dropped = await uploads.sweep();
    if (dropped > 0)
      bb.log.info(`upload-gc dropped ${dropped} stale upload session(s)`);
  });
  void uploads.sweep().catch((error: unknown) => {
    bb.log.warn(`upload-gc sweep at load failed: ${String(error)}`);
  });

  registerRpc(bb, {
    settings,
    bookmarks,
    archiveSupport,
    pluginVersion: PLUGIN_VERSION,
    transfer: {
      extractArchive: archives.extractArchive,
      listArchive: archives.listArchive,
      jobStatus: jobs.jobStatus,
      jobCancel: jobs.jobCancel,
      uploadCreate: uploads.uploadCreate,
      uploadStatus: uploads.uploadStatus,
      uploadFinish: uploads.uploadFinish,
      uploadAbort: uploads.uploadAbort,
    },
  });

  registerMentions(bb);

  bb.log.info(
    `${PLUGIN_NAME} ${PLUGIN_VERSION} loaded — root ${root}` +
      ` (zip:${archiveSupport.zip} tar:${archiveSupport.tar} 7z:${archiveSupport.sevenZip}` +
      ` rar:${archiveSupport.rar})`,
  );

  bb.onDispose(() => {
    bb.log.info(`${PLUGIN_NAME} disposed — root was ${getRoot()}`);
  });
}
