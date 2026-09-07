import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BB_DESKTOP_LOCAL_VIEW_ACTION_CHANNEL,
  LOCAL_VIEW_RETRY_ACTION,
} from "../src/local-view-ipc.js";

interface SendCall {
  channel: string;
  payload: unknown;
}

const electronMock = vi.hoisted(() => {
  const sendCalls: SendCall[] = [];

  return {
    sendCalls,
    contextBridge: {
      exposeInMainWorld(): void {},
    },
    ipcRenderer: {
      invoke(): Promise<null> {
        return Promise.resolve(null);
      },
      on(): void {},
      send(channel: string, payload: unknown): void {
        sendCalls.push({ channel, payload });
      },
    },
    webFrame: {
      getZoomFactor(): number {
        return 1;
      },
    },
  };
});

vi.mock("electron", () => ({
  contextBridge: electronMock.contextBridge,
  ipcRenderer: electronMock.ipcRenderer,
  webFrame: electronMock.webFrame,
}));

interface FakeRetryButton {
  click(): void;
  selector: string | null;
}

function createFakeRetryButton(): FakeRetryButton {
  const clickListeners: (() => void)[] = [];
  let selector: string | null = null;
  const button = {
    addEventListener(event: string, listener: () => void): void {
      if (event === "click") {
        clickListeners.push(listener);
      }
    },
  };

  vi.stubGlobal("document", {
    querySelector(requested: string): typeof button | null {
      selector = requested;
      return requested.includes(LOCAL_VIEW_RETRY_ACTION) ? button : null;
    },
  });

  return {
    click(): void {
      for (const listener of clickListeners) {
        listener();
      }
    },
    get selector(): string | null {
      return selector;
    },
  };
}

async function loadPreloadWithDom(): Promise<() => void> {
  const readyListeners: (() => void)[] = [];
  vi.stubGlobal("window", {
    addEventListener(event: string, listener: () => void): void {
      if (event === "DOMContentLoaded") {
        readyListeners.push(listener);
      }
    },
  });
  vi.resetModules();
  process.env.BB_DESKTOP_VERSION = "0.0.0-test";
  await import("../src/preload.js");

  return () => {
    for (const listener of readyListeners) {
      listener();
    }
  };
}

describe("desktop preload local view actions", () => {
  beforeEach(() => {
    electronMock.sendCalls.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks main to retry the server when the error screen button is clicked", async () => {
    const button = createFakeRetryButton();
    const fireDomReady = await loadPreloadWithDom();

    fireDomReady();
    button.click();

    expect(button.selector).toBe(
      `button[data-local-view-action="${LOCAL_VIEW_RETRY_ACTION}"]`,
    );
    expect(electronMock.sendCalls).toContainEqual({
      channel: BB_DESKTOP_LOCAL_VIEW_ACTION_CHANNEL,
      payload: { action: LOCAL_VIEW_RETRY_ACTION },
    });
  });

  it("sends nothing while the error screen sits untouched", async () => {
    createFakeRetryButton();
    const fireDomReady = await loadPreloadWithDom();

    fireDomReady();

    expect(electronMock.sendCalls).toHaveLength(0);
  });
});
