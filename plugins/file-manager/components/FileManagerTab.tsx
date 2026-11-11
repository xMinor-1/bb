import type {
  ExperimentalThreadActionTabProps,
  PluginNewThreadPanelProps,
} from "@get-bb/plugin-sdk/app";

import { useLocalLocation } from "../hooks/useFmLocation";
import { FileManagerSurface } from "./FileManagerPanel";

function FileManagerTabBody({ threadId = null }: { threadId?: string | null }) {
  const location = useLocalLocation("");
  return (
    <FileManagerSurface
      location={location}
      chrome="inline"
      threadId={threadId}
    />
  );
}

export function FileManagerTab({ threadId }: ExperimentalThreadActionTabProps) {
  return <FileManagerTabBody threadId={threadId} />;
}

export function FileManagerNewThreadTab(_props: PluginNewThreadPanelProps) {
  return <FileManagerTabBody />;
}
