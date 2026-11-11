import type { ArchiveEntry, ArchiveEntryKind } from "../contract";

export interface ArchiveNode {
  id: string;
  name: string;
  path: string;
  kind: ArchiveEntryKind;
  entry: ArchiveEntry | null;
  children: ArchiveNode[];
}

export interface ArchiveRow {
  node: ArchiveNode;
  depth: number;
  expanded: boolean;
}

export function archiveSegments(path: string): string[] {
  const segments = path
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".");
  return path.startsWith("/") ? ["/", ...segments] : segments;
}

function compareNodes(a: ArchiveNode, b: ArchiveNode): number {
  const aFolder = a.kind === "directory" ? 0 : 1;
  const bFolder = b.kind === "directory" ? 0 : 1;
  if (aFolder !== bFolder) return aFolder - bFolder;
  return a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

interface Builder {
  node: ArchiveNode;
  folders: Map<string, Builder>;
}

export function buildArchiveTree(
  entries: readonly ArchiveEntry[],
): ArchiveNode[] {
  let nextId = 0;
  const makeNode = (
    name: string,
    path: string,
    entry: ArchiveEntry | null,
  ): ArchiveNode => ({
    id: `n${String((nextId += 1))}`,
    name,
    path,
    kind: entry === null ? "directory" : entry.kind,
    entry,
    children: [],
  });
  const root: Builder = { node: makeNode("", "", null), folders: new Map() };

  const folderAt = (parent: Builder, name: string, path: string): Builder => {
    let folder = parent.folders.get(name);
    if (folder === undefined) {
      folder = { node: makeNode(name, path, null), folders: new Map() };
      parent.folders.set(name, folder);
      parent.node.children.push(folder.node);
    }
    return folder;
  };

  for (const entry of entries) {
    const segments = archiveSegments(entry.path);
    if (segments.length === 0) continue;
    let parent = root;
    let path = "";
    const last = segments.length - 1;
    for (let index = 0; index < last; index += 1) {
      const segment = segments[index] as string;
      path = path === "" ? segment : `${path === "/" ? "" : path}/${segment}`;
      parent = folderAt(parent, segment, path);
    }
    const name = segments[last] as string;
    path = path === "" ? name : `${path === "/" ? "" : path}/${name}`;
    if (entry.kind === "directory") {
      const folder = folderAt(parent, name, path);
      if (folder.node.entry === null) folder.node.entry = entry;
    } else {
      parent.node.children.push(makeNode(name, path, entry));
    }
  }

  const sortAll = (nodes: ArchiveNode[]): void => {
    nodes.sort(compareNodes);
    for (const node of nodes)
      if (node.children.length > 0) sortAll(node.children);
  };
  sortAll(root.node.children);
  return root.node.children;
}

export function flattenArchiveTree(
  roots: readonly ArchiveNode[],
  expanded: ReadonlySet<string>,
  maxRows: number,
): { rows: ArchiveRow[]; capped: boolean } {
  const rows: ArchiveRow[] = [];
  let capped = false;
  const walk = (nodes: readonly ArchiveNode[], depth: number): void => {
    for (const node of nodes) {
      if (rows.length >= maxRows) {
        capped = true;
        return;
      }
      const open = node.kind === "directory" && expanded.has(node.id);
      rows.push({ node, depth, expanded: open });
      if (open) walk(node.children, depth + 1);
      if (capped) return;
    }
  };
  walk(roots, 0);
  return { rows, capped };
}

export function initialExpanded(
  roots: readonly ArchiveNode[],
  maxDepth = 8,
): Set<string> {
  const expanded = new Set<string>();
  let level = roots;
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const only = level.length === 1 ? level[0] : undefined;
    if (only === undefined || only.kind !== "directory") break;
    expanded.add(only.id);
    level = only.children;
  }
  return expanded;
}

// eslint-disable-next-line no-control-regex -- deliberate: these are what it replaces
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/gu;

export function displayName(name: string): string {
  return name.replace(CONTROL_CHARACTERS, (char) => {
    const code = char.charCodeAt(0);
    return String.fromCharCode(code === 0x7f ? 0x2421 : 0x2400 + code);
  });
}
