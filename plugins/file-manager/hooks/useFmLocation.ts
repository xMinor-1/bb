import { useCallback, useMemo, useRef, useState } from "react";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";

import { PANEL_PATH } from "../contract";

export interface FmLocation {
  subPath: string;
  navigate(subPath: string, options?: { replace?: boolean }): void;
}

export function useRouteLocation(subPath: string): FmLocation {
  const navigate = useBbNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const go = useCallback((next: string, options?: { replace?: boolean }) => {
    navigateRef.current.toPluginPanel(PANEL_PATH, {
      subPath: next,
      ...(options?.replace === true ? { replace: true } : {}),
    });
  }, []);

  return useMemo(() => ({ subPath, navigate: go }), [go, subPath]);
}

export function useLocalLocation(initialSubPath = ""): FmLocation {
  const [subPath, setSubPath] = useState(initialSubPath);
  const go = useCallback((next: string) => {
    setSubPath(next);
  }, []);

  return useMemo(() => ({ subPath, navigate: go }), [go, subPath]);
}
