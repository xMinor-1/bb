import { useEffect, useState } from "react";

import { useFmRpc } from "../lib/fm-rpc";

const RENEW_MARGIN_MS = 30_000;
const MIN_RENEW_DELAY_MS = 5_000;

interface PreviewBase {
  path: string;
  baseUrl: string | null;
}

export interface UsePreviewBaseArgs {
  path: string;
  enabled: boolean;
}

export function usePreviewBase({
  path,
  enabled,
}: UsePreviewBaseArgs): string | null {
  const rpc = useFmRpc();
  const [base, setBase] = useState<PreviewBase | null>(null);
  const [renewal, setRenewal] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: number | null = null;
    void (async () => {
      try {
        const result = await rpc.call("createPreviewUrl", { path });
        if (cancelled) return;
        setBase({ path, baseUrl: result.baseUrl });
        const delay = Math.max(
          MIN_RENEW_DELAY_MS,
          result.expiresAtMs - Date.now() - RENEW_MARGIN_MS,
        );
        timer = window.setTimeout(
          () => setRenewal((count) => count + 1),
          delay,
        );
      } catch {
        if (!cancelled) setBase({ path, baseUrl: null });
      }
    })();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [enabled, path, renewal, rpc]);

  return base !== null && base.path === path ? base.baseUrl : null;
}
