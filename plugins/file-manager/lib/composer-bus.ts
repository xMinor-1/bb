import type { PluginComposerScope } from "@get-bb/plugin-sdk/app";

export function composerScopeKey(scope: PluginComposerScope): string {
  switch (scope.kind) {
    case "thread":
      return `thread:${scope.threadId}`;
    case "queued-message":
      return `queued-message:${scope.threadId}:${scope.queuedMessageId}`;
    case "new-thread":
      return `new-thread:${scope.projectId ?? ""}`;
  }
}

type Listener = (scopeKey: string) => void;

const listeners = new Set<Listener>();

export function requestFilePick(scopeKey: string): void {
  for (const listener of [...listeners]) listener(scopeKey);
}

export function subscribeFilePickRequests(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
