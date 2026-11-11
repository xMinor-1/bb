import { useCallback, useEffect, useRef, useState } from "react";

import type { ThreadWorkspaceReason } from "../contract";
import { parseRpcError } from "../lib/errors";
import { useFmRpc } from "../lib/fm-rpc";
import { defineMessages, messagesNow } from "../lib/i18n";

const messages = defineMessages(
  {
    noEnvironment: "Thread folder: this thread has no workspace",
    noCheckout: "Thread folder: the workspace has no folder yet",
    outsideRoot: "Thread folder: outside your home folder",
  },
  {
    noEnvironment: "Папка треда: у этого треда нет окружения",
    noCheckout: "Папка треда: у окружения ещё нет папки",
    outsideRoot: "Папка треда: вне вашей домашней папки",
  },
);

export type ThreadWorkspaceState =
  | { status: "absent" }
  | { status: "loading" }
  | { status: "ready"; path: string }
  | { status: "blocked"; reason: ThreadWorkspaceReason }
  | { status: "failed"; message: string };

export interface UseThreadWorkspaceResult {
  state: ThreadWorkspaceState;
  reload(): Promise<ThreadWorkspaceState>;
}

export function threadWorkspaceBlockedText(
  reason: ThreadWorkspaceReason,
): string {
  const t = messagesNow(messages);
  switch (reason) {
    case "no_environment":
      return t.noEnvironment;
    case "no_checkout":
      return t.noCheckout;
    case "outside_root":
      return t.outsideRoot;
  }
}

const ABSENT: ThreadWorkspaceState = { status: "absent" };
const LOADING: ThreadWorkspaceState = { status: "loading" };

interface Answered {
  threadId: string | null;
  state: ThreadWorkspaceState;
}

export function useThreadWorkspace(
  threadId: string | null,
): UseThreadWorkspaceResult {
  const rpc = useFmRpc();
  const [answered, setAnswered] = useState<Answered>({
    threadId,
    state: ABSENT,
  });
  const liveRef = useRef(true);
  const ticketRef = useRef(0);

  const state: ThreadWorkspaceState =
    answered.threadId === threadId
      ? answered.state
      : threadId === null
        ? ABSENT
        : LOADING;

  const lookup = useCallback(
    async (id: string): Promise<ThreadWorkspaceState> => {
      const ticket = (ticketRef.current += 1);
      if (liveRef.current) setAnswered({ threadId: id, state: LOADING });

      let next: ThreadWorkspaceState;
      try {
        const answer = await rpc.call("threadWorkspace", { threadId: id });
        if (answer.reason === null && answer.path !== null) {
          next = { status: "ready", path: answer.path };
        } else {
          next = { status: "blocked", reason: answer.reason ?? "no_checkout" };
        }
      } catch (failure) {
        next = { status: "failed", message: parseRpcError(failure).rawMessage };
      }

      if (liveRef.current && ticket === ticketRef.current) {
        setAnswered({ threadId: id, state: next });
      }
      return next;
    },
    [rpc],
  );

  useEffect(() => {
    liveRef.current = true;
    if (threadId !== null) void lookup(threadId);
    return () => {
      liveRef.current = false;
    };
  }, [lookup, threadId]);

  const reload = useCallback(async (): Promise<ThreadWorkspaceState> => {
    if (threadId === null) return ABSENT;
    return lookup(threadId);
  }, [lookup, threadId]);

  return { state, reload };
}
