// @vitest-environment jsdom
import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";

import { PANEL_PATH } from "../../contract";

const app = await loadPluginApp(() => import("../../app"));
const { resetUploadManager } = await import("../../hooks/useUploads");
const { resetPanelSnapshot } = await import("../../components/panel-bus");
const { resetLastFolderStore } = await import("../../lib/last-folder");

beforeEach(() => {
  resetUploadManager();
  resetPanelSnapshot();
  window.localStorage.clear();
  resetLastFolderStore();
});

afterEach(cleanup);

describe("nav panel registration (§10)", () => {
  it("registers exactly one navPanel with the spec'd id / title / icon / path", () => {
    expect(app.navPanels).toHaveLength(1);
    const panel = app.navPanels[0];
    expect(panel).toBeDefined();
    expect({
      id: panel?.id,
      title: panel?.title,
      icon: panel?.icon,
      path: panel?.path,
    }).toEqual({
      id: "file-manager",
      title: "File Manager",
      icon: "FolderOpen",
      path: "files",
    });
    expect(panel?.path).toBe(PANEL_PATH);
    expect(panel?.id).toMatch(/^[a-zA-Z0-9_-]+$/u);
    expect(panel?.path).toMatch(/^[a-zA-Z0-9_-]+$/u);
  });

  it("wires the panel body, the title-bar slot and the upload badge", () => {
    const panel = app.navPanels[0];
    expect(panel?.component).toBeTypeOf("function");
    expect(panel?.headerContent).toBeTypeOf("function");
    expect(panel?.experimental_useBadge).toBeTypeOf("function");
  });

  it("does not register fixedTabs (§10: they strand tree state)", () => {
    expect(app.navPanels[0]?.fixedTabs).toBeUndefined();
  });

  it("registers no frontend slots beyond the panel, the settings section, the launchers, the openers and the composer row", () => {
    expect(app.homepageSections).toHaveLength(0);
    expect(app.settingsSections).toHaveLength(1);
    expect(app.threadPanelActions).toHaveLength(1);
    expect(app.newThreadPanelActions).toHaveLength(1);
    expect(app.fileOpeners).toHaveLength(2);
    expect(app.composerCustomizations).toHaveLength(1);
    expect(app.contentScripts).toHaveLength(0);
  });

  it("registers the thread panel launcher with the nav panel's identity", () => {
    const action = app.threadPanelActions[0];
    expect({
      id: action?.id,
      title: action?.title,
      icon: action?.icon,
      layout: action?.layout,
    }).toEqual({
      id: "file-manager",
      title: "File Manager",
      icon: "FolderOpen",
      layout: "flush",
    });
    expect(action?.component).toBeTypeOf("function");
    expect(action?.id).toMatch(/^[a-zA-Z0-9_-]+$/u);
  });

  it("registers the same launcher on the root New thread screen", () => {
    const action = app.newThreadPanelActions[0];
    expect({
      id: action?.id,
      title: action?.title,
      icon: action?.icon,
      layout: action?.layout,
    }).toEqual({
      id: "file-manager",
      title: "File Manager",
      icon: "FolderOpen",
      layout: "flush",
    });
    expect(action?.component).toBeTypeOf("function");
  });

  it("opens both launchers with host defaults instead of a run hook", () => {
    expect(app.threadPanelActions[0]?.run).toBeUndefined();
    expect(app.newThreadPanelActions[0]?.run).toBeUndefined();
  });

  it("shows no badge while no upload is running", async () => {
    const useBadge = app.navPanels[0]!.experimental_useBadge!;
    function Badge() {
      return <span data-testid="fm-badge">{JSON.stringify(useBadge())}</span>;
    }
    const slot = renderSlot({ component: Badge }, {}, { rpc: {} });
    await waitFor(() => {
      expect(slot.getByTestId("fm-badge").textContent).toBe("null");
    });
  });
});
