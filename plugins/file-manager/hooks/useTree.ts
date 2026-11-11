import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  useRealtime,
  useRealtimeConnectionState,
} from "@get-bb/plugin-sdk/app";

import { FS_CHANNEL, type FileEntry } from "../contract";
import { parseRpcError } from "../lib/errors";
import { isInsideRoot, normalizePath } from "../lib/fm-paths";
import { useFmRpc } from "../lib/fm-rpc";
import { createSessionStore } from "../lib/fm-store";
import { useLang } from "../lib/i18n";
import {
  EMPTY_TREE_STATE,
  EXPANDED_STORAGE_KEY,
  EXPANDED_STORAGE_MAX_BYTES,
  LOAD_CONCURRENCY,
  MAX_EXPANDED_PATHS,
  flattenTree,
  treeReducer,
  type TreeAction,
  type TreeNode,
  type TreeRow,
} from "../lib/fm-tree";
import type { SortDirection, SortField } from "./useDirectory";

const expandedStore = createSessionStore<string[]>({
  key: EXPANDED_STORAGE_KEY,
  fallback: () => [],
  parse: (raw) => {
    if (!Array.isArray(raw)) return null;
    const paths = raw.filter(
      (value): value is string => typeof value === "string",
    );
    return paths
      .filter((path) => isInsideRoot(path))
      .slice(-MAX_EXPANDED_PATHS);
  },
  maxBytes: EXPANDED_STORAGE_MAX_BYTES,
});

function readExpanded(): string[] {
  return expandedStore.read();
}

function rememberExpanded(paths: readonly string[]): void {
  expandedStore.remember([...paths]);
}

function writeExpanded(paths: readonly string[]): void {
  expandedStore.write([...paths]);
}

export function resetTreeStore(): void {
  expandedStore.reset();
}

export interface UseTreeArgs {
  rootPath: string;
  rootEntries: readonly FileEntry[];
  showHidden: boolean;
  sortField: SortField;
  sortDirection: SortDirection;
  query: string;
  enabled: boolean;
}

export interface UseTreeResult {
  rows: readonly TreeRow[];
  visiblePaths: string[];
  rowsTruncated: boolean;
  expandedCount: number;
  isExpanded: (path: string) => boolean;
  toggle: (entry: FileEntry) => void;
  expand: (path: string) => void;
  collapse: (path: string) => void;
  collapseAll: () => void;
  nodeEntries: (path: string) => readonly FileEntry[] | null;
  reload: (path: string) => void;
  refreshAll: () => void;
  pruneSubtree: (paths: readonly string[]) => void;
  remapPrefix: (from: string, to: string) => void;
}

const PERSIST_DEBOUNCE_MS = 250;

export function useTree(args: UseTreeArgs): UseTreeResult {
  const {
    rootPath,
    rootEntries,
    showHidden,
    sortField,
    sortDirection,
    query,
    enabled,
  } = args;
  const rpc = useFmRpc();

  const [state, dispatch] = useReducer(
    treeReducer,
    EMPTY_TREE_STATE,
    (initial) =>
      treeReducer(initial, { type: "hydrate", expanded: readExpanded() }),
  );

  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const nodesRef = useRef(state.nodes);
  nodesRef.current = state.nodes;

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const lang = useLang();
  const flat = useMemo(
    () =>
      flattenTree({
        rootPath,
        rootEntries,
        nodes: state.nodes,
        expanded: state.expanded,
        sortField,
        sortDirection,
        query,
        lang,
      }),
    [
      rootPath,
      rootEntries,
      state.nodes,
      state.expanded,
      sortField,
      sortDirection,
      query,
      lang,
    ],
  );

  useEffect(() => {
    dispatchRef.current({ type: "set-root", path: rootPath });
  }, [rootPath]);

  const inFlight = useRef(new Set<string>());
  const tickets = useRef(new Map<string, number>());
  const ticketSeq = useRef(0);
  const [loadTick, setLoadTick] = useState(0);

  const startLoad = useCallback(
    (path: string, hidden: boolean) => {
      inFlight.current.add(path);
      const ticket = (ticketSeq.current += 1);
      tickets.current.set(path, ticket);
      dispatchRef.current({ type: "load-start", path, showHidden: hidden });
      void (async () => {
        try {
          const result = await rpc.call("listDir", {
            path,
            showHidden: hidden,
          });
          if (mounted.current && tickets.current.get(path) === ticket) {
            dispatchRef.current({
              type: "load-done",
              path,
              entries: result.entries,
              truncated: result.truncated,
              showHidden: hidden,
              atMs: Date.now(),
            });
          }
        } catch (failure) {
          if (mounted.current && tickets.current.get(path) === ticket) {
            dispatchRef.current({
              type: "load-failed",
              path,
              error: parseRpcError(failure),
            });
          }
        } finally {
          inFlight.current.delete(path);
          if (tickets.current.get(path) === ticket)
            tickets.current.delete(path);
          if (mounted.current) setLoadTick((previous) => previous + 1);
        }
      })();
    },
    [rpc],
  );

  useEffect(() => {
    if (!enabled) return;
    const free = LOAD_CONCURRENCY - inFlight.current.size;
    if (free <= 0) return;
    const candidates: string[] = [];
    for (const row of flat.rows) {
      if (row.kind !== "entry" || !row.expanded) continue;
      const path = row.entry.path;
      if (inFlight.current.has(path)) continue;
      const node = state.nodes.get(normalizePath(path));
      const stale =
        node === undefined ||
        node.status === "idle" ||
        node.showHidden !== showHidden;
      if (!stale) continue;
      candidates.push(path);
      if (candidates.length >= free) break;
    }
    for (const path of candidates) startLoad(path, showHidden);
  }, [enabled, flat.rows, loadTick, showHidden, startLoad, state.nodes]);

  const invalidatePaths = useCallback((paths: readonly string[]) => {
    if (paths.length === 0) return;
    const wanted = new Set(paths.map((path) => normalizePath(path)));
    for (const key of [...tickets.current.keys()]) {
      if (wanted.has(normalizePath(key)))
        tickets.current.set(key, (ticketSeq.current += 1));
    }
    dispatchRef.current({ type: "invalidate", paths: [...paths] });
  }, []);

  const invalidateAll = useCallback(() => {
    for (const key of [...tickets.current.keys()]) {
      tickets.current.set(key, (ticketSeq.current += 1));
    }
    dispatchRef.current({ type: "invalidate-all" });
  }, []);

  const invalidatePathsRef = useRef(invalidatePaths);
  invalidatePathsRef.current = invalidatePaths;

  useRealtime(
    FS_CHANNEL,
    useCallback((payload: unknown) => {
      const paths = (payload as { paths?: unknown } | null)?.paths;
      if (!Array.isArray(paths)) return;
      const hits = paths.filter(
        (candidate): candidate is string =>
          typeof candidate === "string" &&
          nodesRef.current.has(normalizePath(candidate)),
      );
      if (hits.length > 0) invalidatePathsRef.current(hits);
    }, []),
  );

  const connectionState = useRealtimeConnectionState();
  const previousConnection = useRef(connectionState);
  useEffect(() => {
    if (
      connectionState === "connected" &&
      previousConnection.current !== "connected"
    ) {
      invalidateAll();
    }
    previousConnection.current = connectionState;
  }, [connectionState, invalidateAll]);

  const pendingWrite = useRef<string[] | null>(null);
  useEffect(() => {
    const paths = Array.from(state.expanded);
    rememberExpanded(paths);
    pendingWrite.current = paths;
    const timer = window.setTimeout(() => {
      pendingWrite.current = null;
      writeExpanded(paths);
    }, PERSIST_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [state.expanded]);

  useEffect(
    () => () => {
      const paths = pendingWrite.current;
      pendingWrite.current = null;
      if (paths !== null) writeExpanded(paths);
    },
    [],
  );

  const send = useCallback((action: TreeAction) => {
    dispatchRef.current(action);
  }, []);

  const expand = useCallback(
    (path: string) => {
      send({ type: "expand", path });
    },
    [send],
  );

  const collapse = useCallback(
    (path: string) => {
      send({ type: "collapse", path });
    },
    [send],
  );

  const collapseAll = useCallback(() => {
    send({ type: "collapse-all" });
  }, [send]);

  const expandedRef = useRef(state.expanded);
  expandedRef.current = state.expanded;

  const isExpanded = useCallback(
    (path: string) => expandedRef.current.has(normalizePath(path)),
    [],
  );

  const toggle = useCallback(
    (entry: FileEntry) => {
      const path = normalizePath(entry.path);
      if (expandedRef.current.has(path)) send({ type: "collapse", path });
      else send({ type: "expand", path });
    },
    [send],
  );

  const nodeEntries = useCallback(
    (path: string): readonly FileEntry[] | null => {
      const node: TreeNode | undefined = nodesRef.current.get(
        normalizePath(path),
      );
      if (node === undefined || node.loadedAtMs === 0) return null;
      return node.entries;
    },
    [],
  );

  const reload = useCallback(
    (path: string) => {
      invalidatePaths([path]);
    },
    [invalidatePaths],
  );

  const refreshAll = useCallback(() => {
    invalidateAll();
  }, [invalidateAll]);

  const pruneSubtree = useCallback(
    (paths: readonly string[]) => {
      if (paths.length === 0) return;
      send({ type: "prune", paths });
    },
    [send],
  );

  const remapPrefix = useCallback(
    (from: string, to: string) => {
      send({ type: "remap", from, to });
    },
    [send],
  );

  return {
    rows: flat.rows,
    visiblePaths: flat.visiblePaths,
    rowsTruncated: flat.truncated,
    expandedCount: state.expanded.size,
    isExpanded,
    toggle,
    expand,
    collapse,
    collapseAll,
    nodeEntries,
    reload,
    refreshAll,
    pruneSubtree,
    remapPrefix,
  };
}
