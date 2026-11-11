import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BbPluginApi } from "@get-bb/plugin-sdk";

import { resolveThreadWorkspace } from "../../src/locate";
import { initRoot } from "../../src/root";

let root = "";
let outside = "";

function fakeBb(overrides: {
  environmentId?: string | null;
  environmentPath?: string | null;
  threadFails?: boolean;
}): BbPluginApi {
  return {
    sdk: {
      threads: {
        get: vi.fn(async () => {
          if (overrides.threadFails === true)
            throw new Error("thread not found");
          return {
            environmentId:
              "environmentId" in overrides ? overrides.environmentId : "env_1",
          };
        }),
      },
      environments: {
        get: vi.fn(async () => ({
          path: overrides.environmentPath ?? null,
          hostId: "host_1",
        })),
      },
    },
  } as unknown as BbPluginApi;
}

beforeEach(async () => {
  root = await realpath(await mkdtemp(path.join(tmpdir(), "fm-workspace-")));
  outside = await realpath(await mkdtemp(path.join(tmpdir(), "fm-elsewhere-")));
  await initRoot(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

describe("resolveThreadWorkspace", () => {
  it("answers with the checkout of the thread's environment", async () => {
    const checkout = path.join(root, "work", "bb-plugins");
    await mkdir(checkout, { recursive: true });

    const answer = await resolveThreadWorkspace(
      fakeBb({ environmentPath: checkout }),
      {
        threadId: "thr_1",
      },
    );

    expect(answer).toEqual({ path: checkout, insideRoot: true, reason: null });
  });

  it("says the thread has no environment instead of throwing", async () => {
    const answer = await resolveThreadWorkspace(
      fakeBb({ environmentId: null }),
      {
        threadId: "thr_1",
      },
    );

    expect(answer).toEqual({
      path: null,
      insideRoot: false,
      reason: "no_environment",
    });
  });

  it("says the environment has no checkout when bb records no path", async () => {
    const answer = await resolveThreadWorkspace(
      fakeBb({ environmentPath: null }),
      {
        threadId: "thr_1",
      },
    );

    expect(answer).toEqual({
      path: null,
      insideRoot: false,
      reason: "no_checkout",
    });
  });

  it("treats a destroyed worktree as no checkout, not as a failure", async () => {
    const answer = await resolveThreadWorkspace(
      fakeBb({ environmentPath: path.join(root, "work", "gone") }),
      { threadId: "thr_1" },
    );

    expect(answer).toEqual({
      path: null,
      insideRoot: false,
      reason: "no_checkout",
    });
  });

  it("refuses a checkout that is a file rather than a directory", async () => {
    const notADir = path.join(root, "checkout.txt");
    await writeFile(notADir, "not a worktree\n");

    const answer = await resolveThreadWorkspace(
      fakeBb({ environmentPath: notADir }),
      {
        threadId: "thr_1",
      },
    );

    expect(answer.reason).toBe("no_checkout");
    expect(answer.path).toBeNull();
  });

  it("reports a checkout outside the home folder, and refuses to open it", async () => {
    const answer = await resolveThreadWorkspace(
      fakeBb({ environmentPath: outside }),
      {
        threadId: "thr_1",
      },
    );

    expect(answer).toEqual({
      path: outside,
      insideRoot: false,
      reason: "outside_root",
    });
  });

  it("applies the clamp to the realpath, not to the string bb handed over", async () => {
    const link = path.join(root, "escape");
    await symlink(outside, link);

    const answer = await resolveThreadWorkspace(
      fakeBb({ environmentPath: link }),
      {
        threadId: "thr_1",
      },
    );

    expect(answer.insideRoot).toBe(false);
    expect(answer.reason).toBe("outside_root");
    expect(answer.path).toBe(outside);
  });

  it("follows a symlinked checkout that stays inside the root", async () => {
    const real = path.join(root, "repos", "bb-plugins");
    await mkdir(real, { recursive: true });
    const link = path.join(root, "current");
    await symlink(real, link);

    const answer = await resolveThreadWorkspace(
      fakeBb({ environmentPath: link }),
      {
        threadId: "thr_1",
      },
    );

    expect(answer).toEqual({ path: real, insideRoot: true, reason: null });
  });

  it("rejects when bb cannot answer for the thread at all", async () => {
    await expect(
      resolveThreadWorkspace(fakeBb({ threadFails: true }), {
        threadId: "thr_gone",
      }),
    ).rejects.toThrow("thread not found");
  });
});
