import { z } from "zod";

export const BB_DESKTOP_LOCAL_VIEW_ACTION_CHANNEL =
  "bb-desktop:local-view:action";

export const LOCAL_VIEW_RETRY_ACTION = "retry-server";

export const LOCAL_VIEW_ACTIONS = [LOCAL_VIEW_RETRY_ACTION] as const;

export const localViewActionRequestSchema = z
  .object({
    action: z.enum(LOCAL_VIEW_ACTIONS),
  })
  .strict();
export type LocalViewActionRequest = z.infer<
  typeof localViewActionRequestSchema
>;
