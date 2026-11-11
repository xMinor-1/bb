import { useCallback, useMemo, useSyncExternalStore } from "react";

import { useFmRpc } from "../lib/fm-rpc";
import {
  UploadManager,
  uploadRpcFromClient,
  type UploadRequest,
  type UploadRpc,
  type UploadState,
} from "../lib/upload-manager";

let sharedManager: UploadManager | null = null;
let sharedRpc: UploadRpc | null = null;

export function getUploadManager(): UploadManager {
  sharedManager ??= new UploadManager({
    rpc: () => {
      if (sharedRpc === null) {
        throw new Error("io_error: the upload manager has no RPC client yet");
      }
      return sharedRpc;
    },
  });
  return sharedManager;
}

export function setUploadRpc(rpc: UploadRpc): void {
  sharedRpc = rpc;
}

export function resetUploadManager(): void {
  sharedManager = null;
  sharedRpc = null;
}

export interface UseUploadsResult {
  uploads: UploadState[];
  active: UploadState[];
  activeCount: number;
  progress: { sentBytes: number; totalBytes: number; ratio: number } | null;
  enqueue: (requests: readonly UploadRequest[]) => void;
  cancel: (id: string) => void;
  retry: (id: string) => void;
  pause: (id: string) => void;
  resume: (id: string) => void;
  remove: (id: string) => void;
  clearFinished: () => void;
  cancelAll: () => void;
  manager: UploadManager;
}

export function useUploads(): UseUploadsResult {
  const rpc = useFmRpc();
  const manager = useMemo(() => {
    setUploadRpc(uploadRpcFromClient(rpc));
    return getUploadManager();
  }, [rpc]);

  const uploads = useSyncExternalStore(
    manager.subscribe,
    manager.getState,
    manager.getState,
  );

  const active = useMemo(
    () =>
      uploads.filter(
        (upload) =>
          upload.status !== "done" &&
          upload.status !== "error" &&
          upload.status !== "canceled",
      ),
    [uploads],
  );

  const progress = useMemo(() => {
    if (active.length === 0) return null;
    const totalBytes = active.reduce(
      (sum, upload) => sum + upload.sizeBytes,
      0,
    );
    const sentBytes = active.reduce((sum, upload) => sum + upload.sentBytes, 0);
    return {
      sentBytes,
      totalBytes,
      ratio: totalBytes > 0 ? Math.min(1, sentBytes / totalBytes) : 0,
    };
  }, [active]);

  const enqueue = useCallback(
    (requests: readonly UploadRequest[]) => {
      manager.enqueue(requests);
    },
    [manager],
  );
  const cancel = useCallback((id: string) => manager.cancel(id), [manager]);
  const retry = useCallback((id: string) => manager.retry(id), [manager]);
  const pause = useCallback((id: string) => manager.pause(id), [manager]);
  const resume = useCallback((id: string) => manager.resume(id), [manager]);
  const remove = useCallback((id: string) => manager.remove(id), [manager]);
  const clearFinished = useCallback(() => manager.clearFinished(), [manager]);
  const cancelAll = useCallback(() => manager.cancelAll(), [manager]);

  return {
    uploads,
    active,
    activeCount: active.length,
    progress,
    enqueue,
    cancel,
    retry,
    pause,
    resume,
    remove,
    clearFinished,
    cancelAll,
    manager,
  };
}
