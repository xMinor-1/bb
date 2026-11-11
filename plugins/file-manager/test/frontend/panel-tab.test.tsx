// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type {
  PluginRpcTestHandlers,
  RenderedSlot,
} from "@get-bb/plugin-sdk/testing/app";

import type { FileEntry, FileManagerContract } from "../../contract";

const HOST_ID = "host_test";

const toasts = vi.hoisted(() => ({
  error: [] as string[],
  success: [] as string[],
}));

vi.mock("sonner", () => ({
  toast: {
    error: (text: string) => void toasts.error.push(text),
    success: (text: string) => void toasts.success.push(text),
    message: () => undefined,
    warning: () => undefined,
    info: () => undefined,
  },
}));

const app = await loadPluginApp(() => import("../../app"));
const { resetUploadManager } = await import("../../hooks/useUploads");
const { resetPanelSnapshot, sendPanelCommand } =
  await import("../../components/panel-bus");
const { resetLastFolderStore } = await import("../../lib/last-folder");

const threadAction = app.threadPanelActions[0]!;
const newThreadAction = app.newThreadPanelActions[0]!;
const headerRegistration = app.navPanels[0]!;
const ROOT = "/home/coder";
const DOCS = `${ROOT}/docs`;

class TestResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??=
  TestResizeObserver as unknown as typeof ResizeObserver;

function entryFor(
  name: string,
  kind: FileEntry["kind"] = "file",
  parent = ROOT,
): FileEntry {
  return {
    name,
    path: `${parent}/${name}`,
    kind,
    targetKind: null,
    sizeBytes: 12,
    modifiedAtMs: Date.UTC(2024, 2, 12),
    isHidden: name.startsWith("."),
    isSymlink: false,
    escapesRoot: false,
    archiveFormat: null,
  };
}

const PREFERENCES = {
  showHiddenFiles: false,
  confirmOnDelete: true,
  restoreLastFolder: true,
  openThreadWorkspace: false,
  sortField: "name" as const,
  sortDirection: "asc" as const,
  viewMode: "list" as const,
};

function listing(path: string, entries: readonly FileEntry[]) {
  return {
    path,
    parentPath: path === ROOT ? null : path.slice(0, path.lastIndexOf("/")),
    isRoot: path === ROOT,
    entries: [...entries],
    truncated: false,
    totalEntries: entries.length,
    hiddenCount: entries.filter((entry) => entry.isHidden).length,
    writable: true,
    volume: null,
  };
}

function baseRpc(
  overrides: Partial<PluginRpcTestHandlers<FileManagerContract>> = {},
): Partial<PluginRpcTestHandlers<FileManagerContract>> {
  const tree: Record<string, ReturnType<typeof listing>> = {
    [ROOT]: listing(ROOT, [
      entryFor("docs", "directory"),
      entryFor("notes.txt"),
    ]),
    [DOCS]: listing(DOCS, [entryFor("spec.md", "file", DOCS)]),
  };
  return {
    getState: () => ({
      root: ROOT,
      startFolder: ROOT,
      preferences: PREFERENCES,
      chunkSizeBytes: 8 * 1024 * 1024,
      maxListEntries: 5000,
      archiveSupport: { zip: true, tar: true, sevenZip: false, rar: false },
      pluginVersion: "0.5.0",
      primaryHostId: HOST_ID,
    }),
    listDir: (input) => {
      const found = tree[input.path];
      if (found === undefined) throw new Error(`not_found: ${input.path}`);
      return found;
    },
    savePreferences: () => ({
      startFolder: ROOT,
      preferences: PREFERENCES,
      chunkSizeBytes: 8 * 1024 * 1024,
    }),
    createFolder: () => ({ entry: entryFor("fresh", "directory") }),
    ...overrides,
  };
}

function mountTab(
  handlers: Partial<PluginRpcTestHandlers<FileManagerContract>> = baseRpc(),
): RenderedSlot {
  return renderSlot(
    { component: threadAction.component },
    { threadId: "thr_1", params: null, environment: null },
    { rpc: handlers as PluginRpcTestHandlers<FileManagerContract> },
  ) as RenderedSlot;
}

function currentPath(slot: RenderedSlot): string | null {
  return slot.getByTestId("fm-panel").getAttribute("data-current-path");
}

async function openOverflow(slot: RenderedSlot): Promise<HTMLElement> {
  fireEvent.pointerDown(slot.getByTestId("fm-panel-overflow"), {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
  return slot.findByRole("menu");
}

function menuItem(menu: HTMLElement, label: string): HTMLElement {
  return within(menu)
    .getAllByRole("menuitem")
    .find((candidate) => (candidate.textContent ?? "").startsWith(label))!;
}

beforeEach(() => {
  toasts.error.length = 0;
  toasts.success.length = 0;
  resetUploadManager();
  resetPanelSnapshot();
  window.localStorage.clear();
  resetLastFolderStore();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("File Manager as a panel tab (§10.1)", () => {
  it("bootstraps and lists the root, exactly as the nav panel does", async () => {
    const slot = mountTab();

    expect(await slot.findByText("notes.txt")).toBeDefined();
    expect(currentPath(slot)).toBe(ROOT);
    expect(slot.inspection.rpcCalls[0]?.method).toBe("getState");
  });

  it("renders the same body from the New thread launcher", async () => {
    const slot = renderSlot(
      { component: newThreadAction.component },
      { projectId: null, params: null },
      { rpc: baseRpc() as PluginRpcTestHandlers<FileManagerContract> },
    ) as RenderedSlot;

    expect(await slot.findByText("notes.txt")).toBeDefined();
  });

  it("walks into a folder through component state, never through the route", async () => {
    const slot = mountTab();
    await slot.findByText("notes.txt");

    const folder = slot
      .getAllByTestId("fm-row")
      .find((row) => row.getAttribute("data-fm-path") === DOCS)!;
    fireEvent.doubleClick(folder);

    await waitFor(() => {
      expect(currentPath(slot)).toBe(DOCS);
    });
    expect(await slot.findByText("spec.md")).toBeDefined();
    expect(slot.inspection.navigateCalls).toEqual([]);
  });

  it("wears the compact toolbar: no title bar to hang the wide controls on", async () => {
    const slot = mountTab();
    await slot.findByText("notes.txt");

    expect(
      slot.getByTestId("fm-toolbar").getAttribute("data-fm-toolbar-variant"),
    ).toBe("compact");
    expect(slot.getByTestId("fm-panel-actions")).toBeDefined();
    expect(slot.queryByTestId("fm-sort-menu")).toBeNull();
    expect(slot.queryByTestId("fm-toggle-hidden")).toBeNull();
    expect(slot.queryByTestId("fm-collapse-all")).toBeNull();
    expect(slot.queryByTestId("fm-refresh")).toBeNull();
  });

  it("folds the filter into a magnifier and unfolds it on demand", async () => {
    const slot = mountTab();
    await slot.findByText("notes.txt");

    expect(slot.queryByTestId("fm-search")).toBeNull();
    fireEvent.click(slot.getByTestId("fm-search-toggle"));

    const field = await slot.findByTestId("fm-search");
    fireEvent.change(field, { target: { value: "notes" } });
    await waitFor(() => {
      expect(slot.getAllByTestId("fm-row")).toHaveLength(1);
    });

    fireEvent.click(slot.getByTestId("fm-search-toggle"));
    await waitFor(() => {
      expect(slot.getAllByTestId("fm-row").length).toBeGreaterThan(1);
    });
    expect(slot.queryByTestId("fm-search")).toBeNull();
  });

  it("keeps the path bar and the filter from claiming the same strip", async () => {
    const slot = mountTab();
    await slot.findByText("notes.txt");

    fireEvent.click(slot.getByTestId("fm-search-toggle"));
    await slot.findByTestId("fm-search");
    expect(slot.queryByTestId("fm-breadcrumbs")).toBeNull();

    fireEvent.keyDown(slot.getByTestId("fm-panel"), {
      key: "l",
      ctrlKey: true,
    });
    const input = await slot.findByTestId("fm-path-input");
    expect((input as HTMLInputElement).value).toBe(ROOT);
    expect(slot.queryByTestId("fm-search")).toBeNull();

    fireEvent.click(slot.getByTestId("fm-search-toggle"));
    await slot.findByTestId("fm-search");
    expect(slot.queryByTestId("fm-path-input")).toBeNull();
  });

  it("opens the new-folder dialog from its own toolbar", async () => {
    const slot = mountTab();
    await slot.findByText("notes.txt");

    fireEvent.click(slot.getByTestId("fm-panel-new-folder"));
    const dialog = await slot.findByTestId("fm-new-folder-dialog");

    fireEvent.change(within(dialog).getByLabelText("Folder name"), {
      target: { value: "fresh" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    await waitFor(() => {
      expect(
        slot.inspection.rpcCalls.filter(
          (call) => call.method === "createFolder",
        ),
      ).toEqual([
        { method: "createFolder", input: { path: ROOT, name: "fresh" } },
      ]);
    });
  });

  it("clicks its own hidden file input from Upload", async () => {
    const slot = mountTab();
    await slot.findByText("notes.txt");
    const input = slot.getByTestId("fm-file-input");
    const clicked = vi.fn();
    input.addEventListener("click", clicked);

    fireEvent.click(slot.getByTestId("fm-panel-upload"));
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("drives refresh, select all and hidden files from the overflow menu", async () => {
    const slot = mountTab();
    await slot.findByText("notes.txt");

    const before = slot.inspection.rpcCalls.filter(
      (call) => call.method === "listDir",
    ).length;
    fireEvent.click(menuItem(await openOverflow(slot), "Refresh"));
    await waitFor(() => {
      expect(
        slot.inspection.rpcCalls.filter((call) => call.method === "listDir")
          .length,
      ).toBe(before + 1);
    });

    fireEvent.click(menuItem(await openOverflow(slot), "Select all"));
    await waitFor(() => {
      expect(
        slot.getAllByTestId("fm-row")[0]?.getAttribute("data-selected"),
      ).toBe("true");
    });

    fireEvent.click(menuItem(await openOverflow(slot), "Show hidden files"));
    await waitFor(() => {
      expect(
        slot.inspection.rpcCalls.filter(
          (call) => call.method === "savePreferences",
        ),
      ).toEqual([
        { method: "savePreferences", input: { showHiddenFiles: true } },
      ]);
    });
  });

  it("stays off the panel bus so it cannot answer for the nav panel", async () => {
    const slot = mountTab();
    await slot.findByText("notes.txt");

    const header = renderSlot(
      { component: headerRegistration.headerContent! },
      { subPath: "" },
      { rpc: {} },
    ) as RenderedSlot;
    expect(
      (header.getByTestId("fm-header-upload") as HTMLButtonElement).disabled,
    ).toBe(true);

    sendPanelCommand({ type: "new-folder" });
    await waitFor(() => {
      expect(slot.queryByTestId("fm-new-folder-dialog")).toBeNull();
    });
  });
});
