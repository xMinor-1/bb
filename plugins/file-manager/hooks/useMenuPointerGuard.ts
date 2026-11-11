import { useCallback, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export interface MenuPointerGuard {
  onPointerDownCapture: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUpCapture: (event: ReactPointerEvent<HTMLElement>) => void;
}

export function useMenuPointerGuard(): MenuPointerGuard {
  const sawPointerDown = useRef(false);

  const onPointerDownCapture = useCallback(() => {
    sawPointerDown.current = true;
  }, []);

  const onPointerUpCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (sawPointerDown.current) {
        sawPointerDown.current = false;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    },
    [],
  );

  return { onPointerDownCapture, onPointerUpCapture };
}
