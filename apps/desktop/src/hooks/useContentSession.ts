import { useEffect, useRef, useState } from "react";
import type { ContentSessionTarget } from "@tau/collaboration";
import useSettingStore from "@/stores/useSettingStore";
import useContentSessionStore, {
  contentSessionKey,
  openContentSession,
} from "@/stores/useContentSessionStore";

export default function useContentSession(
  contentId?: number,
  source?: Omit<ContentSessionTarget, "contentId">
) {
  const databaseName = useSettingStore(state => state.setting.database.active);
  const key = contentSessionKey(databaseName, contentId || 0);
  const entry = useContentSessionStore(state => state.entries[key]);
  const revision = useContentSessionStore(state => state.revision);
  const [error, setError] = useState<string>();
  const sourceRef = useRef(source);
  sourceRef.current = source;
  useEffect(() => {
    if (!contentId) return;
    let active = true;
    void openContentSession(databaseName, { contentId, ...sourceRef.current })
      .then(() => {
        if (active) setError(undefined);
      })
      .catch(failure => {
        if (active) setError(failure instanceof Error ? failure.message : "内容加载失败");
      });
    return () => {
      active = false;
    };
  }, [contentId, databaseName, revision, source?.sourceType, source?.sourceId]);
  return { entry, error, databaseName };
}
