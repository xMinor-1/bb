import { describe, expect, it } from "vitest";

import { wrapRpc, type FileManagerRpcClient } from "../../lib/fm-rpc";
import { setClientRoot } from "../../lib/fm-paths";
import {
  isExternalSettingChange,
  saveStartFolder,
  startFolderLabel,
  startFolderNotInUse,
  startFolderMessages,
} from "../../lib/start-folder";

const ROOT = "/home/coder";

interface RecordedCall {
  method: string;
  input: unknown;
}

function stubRpc(
  result: unknown,
  calls: RecordedCall[] = [],
): { rpc: ReturnType<typeof wrapRpc>; calls: RecordedCall[] } {
  const client = {
    call: (method: string, input: unknown) => {
      calls.push({ method, input });
      if (result instanceof Error) return Promise.reject(result);
      return Promise.resolve(result);
    },
  } as unknown as FileManagerRpcClient;
  return { rpc: wrapRpc(client), calls };
}

describe("saveStartFolder", () => {
  it("writes through savePreferences and returns what the backend stored", async () => {
    const { rpc, calls } = stubRpc({
      startFolder: `${ROOT}/real`,
      preferences: {
        showHiddenFiles: false,
        confirmOnDelete: true,
        restoreLastFolder: true,
        openThreadWorkspace: false,
        sortField: "name",
        sortDirection: "asc",
        viewMode: "list",
      },
      chunkSizeBytes: 16 * 1024 * 1024,
    });

    await expect(saveStartFolder(rpc, `${ROOT}/link`)).resolves.toBe(
      `${ROOT}/real`,
    );
    expect(calls).toEqual([
      { method: "savePreferences", input: { startFolder: `${ROOT}/link` } },
    ]);
  });

  it("rejects with the domain code recovered, so callers can word the failure", async () => {
    const { rpc } = stubRpc(new Error("path_escape: /etc"));

    await expect(saveStartFolder(rpc, "/etc")).rejects.toMatchObject({
      code: "path_escape",
      message: "/etc",
    });
  });

  it("keeps one wording for both surfaces", () => {
    expect(startFolderMessages.en.saved).toBe("Start folder saved");
    expect(startFolderMessages.en.saveFailed).toBe(
      "Could not save the start folder.",
    );
  });
});

describe("startFolderLabel", () => {
  it("names the root and shortens everything below it", () => {
    expect(startFolderLabel(ROOT, ROOT)).toBe("Home");
    expect(startFolderLabel(`${ROOT}/Work`, ROOT)).toBe("Work");
    expect(startFolderLabel(`${ROOT}/Work/projects`, ROOT)).toBe(
      "Work/projects",
    );
    expect(startFolderLabel(`${ROOT}/`, ROOT)).toBe("Home");
  });

  it("falls back to the root label for a path that is not under the root", () => {
    expect(startFolderLabel("/etc", ROOT)).toBe("Home");
  });

  it("defaults to the client root published by the panel", () => {
    setClientRoot(ROOT);
    try {
      expect(startFolderLabel(`${ROOT}/Work`)).toBe("Work");
    } finally {
      setClientRoot("/");
    }
  });
});

describe("isExternalSettingChange", () => {
  it("is true only when a value the host already delivered was replaced", () => {
    expect(isExternalSettingChange(`${ROOT}/Work`, ROOT)).toBe(true);
    expect(isExternalSettingChange(ROOT, ROOT)).toBe(false);
  });

  it("is false for the first delivery — the query resolving is not a write", () => {
    expect(isExternalSettingChange(undefined, ROOT)).toBe(false);
    expect(isExternalSettingChange(null, ROOT)).toBe(false);
    expect(isExternalSettingChange(true, ROOT)).toBe(false);
  });
});

describe("startFolderNotInUse", () => {
  it("reports the configured folder when the backend fell back to the root", () => {
    expect(startFolderNotInUse(`${ROOT}/gone`, ROOT, ROOT)).toBe(
      `${ROOT}/gone`,
    );
    expect(startFolderNotInUse("/etc", ROOT, ROOT)).toBe("/etc");
  });

  it("normalizes the setting the way the backend does before comparing", () => {
    expect(startFolderNotInUse("~", ROOT, ROOT)).toBeNull();
    expect(startFolderNotInUse("", ROOT, ROOT)).toBeNull();
    expect(startFolderNotInUse(`${ROOT}/`, ROOT, ROOT)).toBeNull();
    expect(startFolderNotInUse("~/gone", ROOT, ROOT)).toBe(`${ROOT}/gone`);
    expect(startFolderNotInUse("gone", ROOT, ROOT)).toBe(`${ROOT}/gone`);
  });

  it("says nothing when the backend resolved a real folder", () => {
    expect(
      startFolderNotInUse(`${ROOT}/link`, `${ROOT}/real`, ROOT),
    ).toBeNull();
    expect(
      startFolderNotInUse(`${ROOT}/Work`, `${ROOT}/Work`, ROOT),
    ).toBeNull();
  });

  it("says nothing before the host has delivered a setting", () => {
    expect(startFolderNotInUse(undefined, ROOT, ROOT)).toBeNull();
    expect(startFolderNotInUse(null, ROOT, ROOT)).toBeNull();
    expect(startFolderNotInUse(true, ROOT, ROOT)).toBeNull();
    expect(startFolderNotInUse("   ", ROOT, ROOT)).toBeNull();
  });
});
