import { beforeEach, describe, expect, it, vi } from "vitest";
import { BB_DESKTOP_LOCAL_VIEW_ACTION_CHANNEL } from "../src/local-view-ipc.js";
import { registerLocalViewIpc } from "../src/local-view-main-ipc.js";

const electronMock = vi.hoisted(() => {
  type FakeIpcListener = (event: unknown, payload: unknown) => void;

  const listeners = new Map<string, FakeIpcListener>();

  return {
    listeners,
    ipcMain: {
      on(channel: string, listener: FakeIpcListener): void {
        listeners.set(channel, listener);
      },
    },
  };
});

vi.mock("electron", () => ({
  ipcMain: electronMock.ipcMain,
}));

function sendAction(payload: unknown): void {
  const listener = electronMock.listeners.get(
    BB_DESKTOP_LOCAL_VIEW_ACTION_CHANNEL,
  );
  if (listener === undefined) {
    throw new Error("no listener registered for the local view action channel");
  }
  listener({}, payload);
}

describe("registerLocalViewIpc", () => {
  beforeEach(() => {
    electronMock.listeners.clear();
  });

  it("retries the server target when the retry button is pressed", () => {
    const retryServerTarget = vi.fn();
    registerLocalViewIpc({ retryServerTarget });

    sendAction({ action: "retry-server" });

    expect(retryServerTarget).toHaveBeenCalledTimes(1);
  });

  it("ignores payloads a renderer should never send", () => {
    const retryServerTarget = vi.fn();
    registerLocalViewIpc({ retryServerTarget });

    sendAction({ action: "quit" });
    sendAction({ action: "retry-server", extra: true });
    sendAction("retry-server");
    sendAction(null);

    expect(retryServerTarget).not.toHaveBeenCalled();
  });
});
