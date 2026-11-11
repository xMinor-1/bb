import { MAX_LIST_ENTRIES, type FileEntry } from "../contract";
import {
  matchesQuery,
  sortEntries,
  type SortDirection,
  type SortField,
} from "../hooks/useDirectory";
import { describeErrorCode, type ParsedRpcError } from "./errors";
import { isDescendant, isSameOrDescendant, normalizePath } from "./fm-paths";
import { defineMessages, getLang, type Lang } from "./i18n";

const messages = defineMessages(
  {
    cannotOpen: "Could not open this folder.",
    filterEmpty: "Nothing in here matches the filter",
  },
  {
    cannotOpen: "Не удалось открыть эту папку.",
    filterEmpty: "Здесь ничего не подходит под фильтр",
  },
);

type TreeMessages = (typeof messages)[Lang];

export const INDENT_STEP_PX = 12;
export const MAX_INDENT_DEPTH = 12;
export const MAX_TREE_DEPTH = 32;
export const MAX_TREE_ROWS = MAX_LIST_ENTRIES;
export const MAX_EXPANDED_PATHS = 200;
export const MAX_CACHED_NODES = 256;
export const LOAD_CONCURRENCY = 4;
export const AUTO_EXPAND_HOVER_MS = 700;
export const EXPANDED_STORAGE_KEY = "bb-plugin-file-manager:expanded:v1";
export const EXPANDED_STORAGE_MAX_BYTES = 64 * 1024;

export type TreeNodeStatus = "idle" | "loading" | "ready" | "error";

export interface TreeNode {
  path: string;
  status: TreeNodeStatus;
  entries: readonly FileEntry[];
  truncated: boolean;
  showHidden: boolean;
  error: ParsedRpcError | null;
  loadedAtMs: number;
}

export interface TreeState {
  expanded: ReadonlySet<string>;
  nodes: ReadonlyMap<string, TreeNode>;
}

export const EMPTY_TREE_STATE: TreeState = {
  expanded: new Set<string>(),
  nodes: new Map<string, TreeNode>(),
};

export interface TreeEntryRow {
  kind: "entry";
  key: string;
  entry: FileEntry;
  depth: number;
  parentPath: string;
  expandable: boolean;
  expanded: boolean;
  loading: boolean;
  childrenTruncated: boolean;
}

export interface TreeStatusRow {
  kind: "status";
  key: string;
  depth: number;
  parentPath: string;
  status: "empty" | "error";
  message: string | null;
}

export type TreeRow = TreeEntryRow | TreeStatusRow;

function effectiveKind(entry: FileEntry): FileEntry["kind"] {
  if (entry.isSymlink && entry.targetKind !== null) return entry.targetKind;
  return entry.kind;
}

export function isExpandableEntry(entry: FileEntry, depth: number): boolean {
  if (entry.escapesRoot) return false;
  if (depth >= MAX_TREE_DEPTH) return false;
  return effectiveKind(entry) === "directory";
}

export function topLevelPaths(paths: readonly string[]): string[] {
  if (paths.length < 2) return [...paths];
  const selected = new Set(paths.map((path) => normalizePath(path)));
  const hasSelectedAncestor = (key: string): boolean => {
    let current = key;
    for (;;) {
      const index = current.lastIndexOf("/");
      if (index <= 0) return false;
      current = current.slice(0, index);
      if (selected.has(current)) return true;
    }
  };
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const path of paths) {
    const key = normalizePath(path);
    if (seen.has(key) || hasSelectedAncestor(key)) continue;
    seen.add(key);
    kept.push(path);
  }
  return kept;
}

export interface FlattenTreeArgs {
  rootPath: string;
  rootEntries: readonly FileEntry[];
  nodes: ReadonlyMap<string, TreeNode>;
  expanded: ReadonlySet<string>;
  sortField: SortField;
  sortDirection: SortDirection;
  query?: string;
  maxRows?: number;
  lang?: Lang;
}

export interface FlattenTreeResult {
  rows: TreeRow[];
  visiblePaths: string[];
  truncated: boolean;
}

const ROW_PLACEHOLDER: TreeStatusRow = {
  kind: "status",
  key: "",
  depth: 0,
  parentPath: "",
  status: "empty",
  message: null,
};

interface ChildPlan {
  entries: readonly FileEntry[];
  loading: boolean;
  status: "empty" | "error" | null;
  message: string | null;
}

function planChildren(node: TreeNode | undefined, t: TreeMessages): ChildPlan {
  if (node === undefined) {
    return { entries: [], loading: true, status: null, message: null };
  }
  if (node.status === "error") {
    return {
      entries: [],
      loading: false,
      status: "error",
      message: node.error === null ? t.cannotOpen : errorText(node.error, t),
    };
  }
  const cold = node.loadedAtMs === 0;
  if (cold && (node.status === "idle" || node.status === "loading")) {
    return { entries: [], loading: true, status: null, message: null };
  }
  const loading = node.status !== "ready";
  if (node.entries.length === 0) {
    return { entries: [], loading, status: "empty", message: null };
  }
  return { entries: node.entries, loading, status: null, message: null };
}

function errorText(error: ParsedRpcError, t: TreeMessages): string {
  const message = error.message.trim();
  if (error.code !== null) {
    const sentence = describeErrorCode(error.code);
    return message === "" || message === sentence
      ? sentence
      : `${sentence} (${message})`;
  }
  if (message !== "") return message;
  const raw = error.rawMessage.trim();
  return raw === "" ? t.cannotOpen : raw;
}

export function flattenTree(args: FlattenTreeArgs): FlattenTreeResult {
  const { rootPath, rootEntries, nodes, expanded, sortField, sortDirection } =
    args;
  const query = args.query ?? "";
  const maxRows = args.maxRows ?? MAX_TREE_ROWS;
  const t = messages[args.lang ?? getLang()];
  const filtering = query.trim() !== "";

  const rows: TreeRow[] = [];
  let truncated = false;

  const pushStatus = (row: TreeStatusRow): void => {
    if (rows.length >= maxRows) {
      truncated = true;
      return;
    }
    rows.push(row);
  };

  const build = (
    parentPath: string,
    entries: readonly FileEntry[],
    depth: number,
  ): boolean => {
    let matchedAny = false;
    for (const entry of entries) {
      if (rows.length >= maxRows) {
        truncated = true;
        break;
      }
      const selfMatch = !filtering || matchesQuery(entry, query);
      const expandable = isExpandableEntry(entry, depth);
      const isOpen = expandable && expanded.has(normalizePath(entry.path));

      const slot = rows.length;
      rows.push(ROW_PLACEHOLDER);

      let loading = false;
      let childrenTruncated = false;
      let childMatched = false;
      let filteredOut = false;

      if (isOpen) {
        const node = nodes.get(normalizePath(entry.path));
        const plan = planChildren(node, t);
        loading = plan.loading;
        childrenTruncated = node?.truncated ?? false;
        if (plan.status !== null) {
          pushStatus({
            kind: "status",
            key: `${plan.status}:${entry.path}`,
            depth: depth + 1,
            parentPath: entry.path,
            status: plan.status,
            message: plan.message,
          });
        } else if (plan.entries.length > 0) {
          const sorted = sortEntries(plan.entries, sortField, sortDirection, {
            foldersFirst: true,
          });
          childMatched = build(entry.path, sorted, depth + 1);
          filteredOut = filtering && !childMatched;
        }
      }

      if (!selfMatch && !childMatched) {
        rows.length = slot;
        continue;
      }

      rows[slot] = {
        kind: "entry",
        key: entry.path,
        entry,
        depth,
        parentPath,
        expandable,
        expanded: isOpen,
        loading,
        childrenTruncated,
      };
      matchedAny = true;

      if (filteredOut) {
        pushStatus({
          kind: "status",
          key: `filtered:${entry.path}`,
          depth: depth + 1,
          parentPath: entry.path,
          status: "empty",
          message: t.filterEmpty,
        });
      }
    }
    return matchedAny;
  };

  build(rootPath, rootEntries, 0);

  const visiblePaths: string[] = [];
  for (const row of rows)
    if (row.kind === "entry") visiblePaths.push(row.entry.path);

  return { rows, visiblePaths, truncated };
}

export type TreeAction =
  | { type: "hydrate"; expanded: readonly string[] }
  | { type: "expand"; path: string }
  | { type: "collapse"; path: string }
  | { type: "collapse-all" }
  | { type: "load-start"; path: string; showHidden: boolean }
  | {
      type: "load-done";
      path: string;
      entries: readonly FileEntry[];
      truncated: boolean;
      showHidden: boolean;
      atMs: number;
    }
  | { type: "load-failed"; path: string; error: ParsedRpcError }
  | { type: "invalidate"; paths: readonly string[] }
  | { type: "invalidate-all" }
  | { type: "prune"; paths: readonly string[] }
  | { type: "remap"; from: string; to: string }
  | { type: "set-root"; path: string };

function capNodes(
  nodes: ReadonlyMap<string, TreeNode>,
  expanded: ReadonlySet<string>,
): ReadonlyMap<string, TreeNode> {
  if (nodes.size <= MAX_CACHED_NODES) return nodes;
  const victims = Array.from(nodes.values())
    .filter((node) => !expanded.has(node.path))
    .sort((a, b) => a.loadedAtMs - b.loadedAtMs);
  const next = new Map(nodes);
  for (const victim of victims) {
    if (next.size <= MAX_CACHED_NODES) break;
    next.delete(victim.path);
  }
  return next;
}

function capExpanded(expanded: Set<string>, keep: string): Set<string> {
  while (expanded.size > MAX_EXPANDED_PATHS) {
    let victim: string | null = null;
    for (const candidate of expanded) {
      if (candidate === keep) continue;
      if (isDescendant(keep, candidate)) continue;
      victim = candidate;
      break;
    }
    if (victim === null) break;
    expanded.delete(victim);
  }
  return expanded;
}

function withNode(
  state: TreeState,
  path: string,
  update: (previous: TreeNode | undefined) => TreeNode,
): TreeState {
  const key = normalizePath(path);
  const nodes = new Map(state.nodes);
  nodes.set(key, update(state.nodes.get(key)));
  return { expanded: state.expanded, nodes };
}

function remapPath(path: string, from: string, to: string): string {
  if (path === from) return to;
  return `${to}${path.slice(from.length)}`;
}

function baseNameOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? path : path.slice(index + 1);
}

function remapEntries(
  entries: readonly FileEntry[],
  from: string,
  to: string,
): readonly FileEntry[] {
  let changed = false;
  const next = entries.map((entry) => {
    const path = normalizePath(entry.path);
    if (!isSameOrDescendant(path, from)) return entry;
    changed = true;
    const remapped = remapPath(path, from, to);
    return path === from
      ? { ...entry, path: remapped, name: baseNameOf(to) }
      : { ...entry, path: remapped };
  });
  return changed ? next : entries;
}

export function treeReducer(state: TreeState, action: TreeAction): TreeState {
  switch (action.type) {
    case "hydrate": {
      const paths = action.expanded
        .filter((path) => typeof path === "string" && path !== "")
        .map((path) => normalizePath(path));
      const expanded = new Set(paths.slice(-MAX_EXPANDED_PATHS));
      if (expanded.size === 0 && state.expanded.size === 0) return state;
      return { expanded, nodes: state.nodes };
    }

    case "expand": {
      const path = normalizePath(action.path);
      if (state.expanded.has(path)) return state;
      const expanded = capExpanded(new Set(state.expanded).add(path), path);
      return { expanded, nodes: state.nodes };
    }

    case "collapse": {
      const path = normalizePath(action.path);
      if (!state.expanded.has(path)) return state;
      const expanded = new Set(state.expanded);
      expanded.delete(path);
      return { expanded, nodes: state.nodes };
    }

    case "collapse-all": {
      if (state.expanded.size === 0) return state;
      return { expanded: new Set<string>(), nodes: state.nodes };
    }

    case "load-start":
      return withNode(state, action.path, (previous) => ({
        path: normalizePath(action.path),
        status: "loading",
        entries: previous?.entries ?? [],
        truncated: previous?.truncated ?? false,
        showHidden: action.showHidden,
        error: null,
        loadedAtMs: previous?.loadedAtMs ?? 0,
      }));

    case "load-done": {
      const next = withNode(state, action.path, () => ({
        path: normalizePath(action.path),
        status: "ready",
        entries: action.entries,
        truncated: action.truncated,
        showHidden: action.showHidden,
        error: null,
        loadedAtMs: action.atMs,
      }));
      return {
        expanded: next.expanded,
        nodes: capNodes(next.nodes, next.expanded),
      };
    }

    case "load-failed":
      return withNode(state, action.path, (previous) => ({
        path: normalizePath(action.path),
        status: "error",
        entries: previous?.entries ?? [],
        truncated: previous?.truncated ?? false,
        showHidden: previous?.showHidden ?? false,
        error: action.error,
        loadedAtMs: previous?.loadedAtMs ?? 0,
      }));

    case "invalidate": {
      let nodes: Map<string, TreeNode> | null = null;
      for (const raw of action.paths) {
        const path = normalizePath(raw);
        const node = state.nodes.get(path);
        if (node === undefined || node.status === "idle") continue;
        nodes ??= new Map(state.nodes);
        nodes.set(path, { ...node, status: "idle", error: null });
      }
      return nodes === null ? state : { expanded: state.expanded, nodes };
    }

    case "invalidate-all": {
      if (state.nodes.size === 0) return state;
      let changed = false;
      const nodes = new Map<string, TreeNode>();
      for (const [path, node] of state.nodes) {
        if (node.status === "idle") {
          nodes.set(path, node);
          continue;
        }
        changed = true;
        nodes.set(path, { ...node, status: "idle", error: null });
      }
      return changed ? { expanded: state.expanded, nodes } : state;
    }

    case "prune": {
      const roots = action.paths.map((path) => normalizePath(path));
      if (roots.length === 0) return state;
      const hit = (candidate: string): boolean =>
        roots.some((root) => isSameOrDescendant(candidate, root));

      let expanded = state.expanded;
      const keptExpanded = new Set<string>();
      let expandedChanged = false;
      for (const path of state.expanded) {
        if (hit(path)) expandedChanged = true;
        else keptExpanded.add(path);
      }
      if (expandedChanged) expanded = keptExpanded;

      let nodes = state.nodes;
      const keptNodes = new Map<string, TreeNode>();
      let nodesChanged = false;
      for (const [path, node] of state.nodes) {
        if (hit(path)) nodesChanged = true;
        else keptNodes.set(path, node);
      }
      if (nodesChanged) nodes = keptNodes;

      if (!expandedChanged && !nodesChanged) return state;
      return { expanded, nodes };
    }

    case "remap": {
      const from = normalizePath(action.from);
      const to = normalizePath(action.to);
      if (from === to) return state;

      const expanded = new Set<string>();
      let expandedChanged = false;
      for (const path of state.expanded) {
        if (isSameOrDescendant(path, from)) {
          expanded.add(remapPath(path, from, to));
          expandedChanged = true;
        } else {
          expanded.add(path);
        }
      }

      const nodes = new Map<string, TreeNode>();
      let nodesChanged = false;
      for (const [path, node] of state.nodes) {
        const entries = remapEntries(node.entries, from, to);
        if (!isSameOrDescendant(path, from)) {
          if (entries === node.entries) {
            nodes.set(path, node);
          } else {
            nodesChanged = true;
            nodes.set(path, { ...node, entries });
          }
          continue;
        }
        const key = remapPath(path, from, to);
        nodesChanged = true;
        nodes.set(key, { ...node, path: key, entries });
      }

      if (!expandedChanged && !nodesChanged) return state;
      return {
        expanded: expandedChanged ? expanded : state.expanded,
        nodes: nodesChanged ? nodes : state.nodes,
      };
    }

    case "set-root": {
      const root = normalizePath(action.path);
      const kept = new Map<string, TreeNode>();
      let changed = false;
      for (const [path, node] of state.nodes) {
        if (isSameOrDescendant(path, root) || isDescendant(root, path))
          kept.set(path, node);
        else changed = true;
      }
      const nodes = capNodes(changed ? kept : state.nodes, state.expanded);
      if (nodes === state.nodes) return state;
      return { expanded: state.expanded, nodes };
    }

    default:
      return state;
  }
}
