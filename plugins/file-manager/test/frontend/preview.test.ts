import { describe, expect, it } from "vitest";

import type { FileEntry } from "../../contract";
import { isImageEntry, isImageName, previewUrl } from "../../lib/preview";
import { isViewableEntry, viewerKindFor } from "../../lib/viewer";

function entry(partial: Partial<FileEntry> & { name: string }): FileEntry {
  return {
    name: partial.name,
    path: partial.path ?? `/home/coder/${partial.name}`,
    kind: partial.kind ?? "file",
    targetKind: partial.targetKind ?? null,
    sizeBytes: 10,
    modifiedAtMs: 0,
    isHidden: partial.name.startsWith("."),
    isSymlink: partial.isSymlink ?? false,
    escapesRoot: partial.escapesRoot ?? false,
    archiveFormat: null,
  };
}

describe("isImageName", () => {
  it.each([
    "a.png",
    "a.JPG",
    "a.jpeg",
    "a.gif",
    "a.webp",
    "a.avif",
    "a.bmp",
    "a.svg",
  ])("accepts %s", (name) => {
    expect(isImageName(name)).toBe(true);
  });

  it.each([
    "a.tiff",
    "a.heic",
    "a.psd",
    "a.ico",
    "a.txt",
    "archive.zip",
    "Makefile",
    ".png",
  ])("rejects %s", (name) => {
    expect(isImageName(name)).toBe(false);
  });

  it("reads the last extension of a double-barrelled name", () => {
    expect(isImageName("logo.svg.png")).toBe(true);
    expect(isImageName("logo.png.txt")).toBe(false);
  });
});

describe("isImageEntry", () => {
  it("takes a plain image file", () => {
    expect(isImageEntry(entry({ name: "shot.png" }))).toBe(true);
  });

  it("takes a symlink that points at a file, like every other view does", () => {
    expect(
      isImageEntry(
        entry({
          name: "shot.png",
          kind: "symlink",
          isSymlink: true,
          targetKind: "file",
        }),
      ),
    ).toBe(true);
  });

  it("refuses a directory named like an image", () => {
    expect(
      isImageEntry(entry({ name: "sprites.png", kind: "directory" })),
    ).toBe(false);
  });

  it("refuses a link that leaves the root — nothing reads through those", () => {
    expect(
      isImageEntry(
        entry({
          name: "shot.png",
          kind: "symlink",
          isSymlink: true,
          targetKind: "file",
          escapesRoot: true,
        }),
      ),
    ).toBe(false);
  });
});

describe("previewUrl", () => {
  it("appends one segment", () => {
    expect(previewUrl("https://bb.test/p/tok", "shot.png")).toBe(
      "https://bb.test/p/tok/shot.png",
    );
  });

  it("does not double the separator when the base already ends in one", () => {
    expect(previewUrl("https://bb.test/p/tok/", "shot.png")).toBe(
      "https://bb.test/p/tok/shot.png",
    );
  });

  it("encodes each segment but keeps the separators", () => {
    expect(previewUrl("https://bb.test/p/tok", "my photos/a b.png")).toBe(
      "https://bb.test/p/tok/my%20photos/a%20b.png",
    );
  });

  it("encodes the characters that would otherwise end the path", () => {
    expect(previewUrl("https://bb.test/p/tok", "a#b?c%d.png")).toBe(
      "https://bb.test/p/tok/a%23b%3Fc%25d.png",
    );
  });

  it("answers the base itself for an empty relative path", () => {
    expect(previewUrl("https://bb.test/p/tok", "")).toBe(
      "https://bb.test/p/tok",
    );
  });
});

describe("viewerKindFor", () => {
  it("names the four kinds a browser paints from a URL", () => {
    expect(viewerKindFor("shot.PNG")).toBe("image");
    expect(viewerKindFor("scan.svg")).toBe("image");
    expect(viewerKindFor("manual.pdf")).toBe("pdf");
    expect(viewerKindFor("clip.MP4")).toBe("video");
    expect(viewerKindFor("song.flac")).toBe("audio");
  });

  it("keeps markdown apart, so it can be rendered as a document", () => {
    expect(viewerKindFor("README.md")).toBe("markdown");
    expect(viewerKindFor("notes.markdown")).toBe("markdown");
    expect(viewerKindFor("page.mdx")).toBe("markdown");
  });

  it("sends everything else to the text branch, extension or not", () => {
    for (const name of ["Makefile", "LICENSE", ".gitignore", "server.ts"]) {
      expect(viewerKindFor(name)).toBe("text");
    }
    expect(viewerKindFor("tool.bin")).toBe("text");
    expect(viewerKindFor("bundle.zip")).toBe("text");
  });

  it("leaves the containers a browser cannot play to the text branch", () => {
    expect(viewerKindFor("film.mkv")).toBe("text");
    expect(viewerKindFor("old.avi")).toBe("text");
  });
});

describe("isViewableEntry", () => {
  it("takes files and symlinks to files, and nothing else", () => {
    expect(isViewableEntry(entry({ name: "a.txt" }))).toBe(true);
    expect(
      isViewableEntry(
        entry({
          name: "link",
          isSymlink: true,
          kind: "symlink",
          targetKind: "file",
        }),
      ),
    ).toBe(true);
    expect(isViewableEntry(entry({ name: "docs", kind: "directory" }))).toBe(
      false,
    );
    expect(isViewableEntry(entry({ name: "pipe", kind: "other" }))).toBe(false);
    expect(isViewableEntry(entry({ name: "out.txt", escapesRoot: true }))).toBe(
      false,
    );
  });
});
