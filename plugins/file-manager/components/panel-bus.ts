import { useSyncExternalStore } from "react";

export interface PanelSnapshot {
  currentPath: string;
  writable: boolean;
  ready: boolean;
  showHidden: boolean;
  selectionCount: number;
  canPaste: boolean;
}

export type PanelCommand =
  | { type: "upload" }
  | { type: "new-folder" }
  | { type: "refresh" }
  | { type: "toggle-hidden" }
  | { type: "select-all" }
  | { type: "paste" }
  | { type: "copy-path" }
  | { type: "set-start-folder" }
  | { type: "collapse-all" };

const INITIAL: PanelSnapshot = {
  currentPath: "",
  writable: false,
  ready: false,
  showHidden: false,
  selectionCount: 0,
  canPaste: false,
};

let snapshot: PanelSnapshot = INITIAL;
const snapshotListeners = new Set<() => void>();
const commandListeners = new Set<(command: PanelCommand) => void>();

function sameSnapshot(a: PanelSnapshot, b: PanelSnapshot): boolean {
  return (
    a.currentPath === b.currentPath &&
    a.writable === b.writable &&
    a.ready === b.ready &&
    a.showHidden === b.showHidden &&
    a.selectionCount === b.selectionCount &&
    a.canPaste === b.canPaste
  );
}

export function publishPanelSnapshot(next: PanelSnapshot): void {
  if (sameSnapshot(snapshot, next)) return;
  snapshot = next;
  for (const listener of snapshotListeners) listener();
}

export function resetPanelSnapshot(): void {
  publishPanelSnapshot(INITIAL);
}

function subscribeSnapshot(listener: () => void): () => void {
  snapshotListeners.add(listener);
  return () => {
    snapshotListeners.delete(listener);
  };
}

function readSnapshot(): PanelSnapshot {
  return snapshot;
}

export function usePanelSnapshot(): PanelSnapshot {
  return useSyncExternalStore(subscribeSnapshot, readSnapshot, readSnapshot);
}

export function sendPanelCommand(command: PanelCommand): void {
  for (const listener of [...commandListeners]) listener(command);
}

export function subscribePanelCommands(
  listener: (command: PanelCommand) => void,
): () => void {
  commandListeners.add(listener);
  return () => {
    commandListeners.delete(listener);
  };
}
