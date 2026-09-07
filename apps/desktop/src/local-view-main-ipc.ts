import { ipcMain } from "electron";
import {
  BB_DESKTOP_LOCAL_VIEW_ACTION_CHANNEL,
  localViewActionRequestSchema,
} from "./local-view-ipc.js";

interface RegisterLocalViewIpcArgs {
  retryServerTarget(): void;
}

export function registerLocalViewIpc(args: RegisterLocalViewIpcArgs): void {
  ipcMain.on(
    BB_DESKTOP_LOCAL_VIEW_ACTION_CHANNEL,
    (_event, payload: unknown) => {
      const parsed = localViewActionRequestSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }
      args.retryServerTarget();
    },
  );
}
