import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MAX_BOOKMARKS, type Bookmark } from "../contract";
import { isBookmarked as isBookmarkedIn } from "../lib/bookmarks";
import { useFmRpc } from "../lib/fm-rpc";

export interface UseBookmarksResult {
  bookmarks: readonly Bookmark[];
  loading: boolean;
  full: boolean;
  isBookmarked: (path: string) => boolean;
  add: (path: string, name?: string | null) => Promise<void>;
  remove: (path: string) => Promise<void>;
  rename: (path: string, name: string) => Promise<void>;
  refresh: () => void;
}

export function useBookmarks(): UseBookmarksResult {
  const rpc = useFmRpc();
  const [bookmarks, setBookmarks] = useState<readonly Bookmark[]>([]);
  const [loading, setLoading] = useState(true);

  const issuedRef = useRef(0);
  const paintedRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const run = useCallback(
    async (call: () => Promise<{ bookmarks: Bookmark[] }>): Promise<void> => {
      const stamp = (issuedRef.current += 1);
      const result = await call();
      if (!mountedRef.current || stamp <= paintedRef.current) return;
      paintedRef.current = stamp;
      setBookmarks(result.bookmarks);
    },
    [],
  );

  const refresh = useCallback(() => {
    void run(() => rpc.call("listBookmarks", null))
      .catch(() => {})
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
  }, [rpc, run]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = useCallback(
    (path: string, name: string | null = null): Promise<void> =>
      run(() => rpc.call("addBookmark", { path, name })),
    [rpc, run],
  );

  const remove = useCallback(
    (path: string): Promise<void> =>
      run(() => rpc.call("removeBookmark", { path })),
    [rpc, run],
  );

  const rename = useCallback(
    (path: string, name: string): Promise<void> =>
      run(() => rpc.call("renameBookmark", { path, name })),
    [rpc, run],
  );

  const isBookmarked = useCallback(
    (path: string) => isBookmarkedIn(bookmarks, path),
    [bookmarks],
  );

  return useMemo(
    () => ({
      bookmarks,
      loading,
      full: bookmarks.length >= MAX_BOOKMARKS,
      isBookmarked,
      add,
      remove,
      rename,
      refresh,
    }),
    [add, bookmarks, isBookmarked, loading, refresh, remove, rename],
  );
}
