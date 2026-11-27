import { useEffect, useRef, useState } from "react";
import type { ContentSessionTarget } from "@tau/collaboration";
import useSettingStore from "@/stores/useSettingStore";
import { useHooksFeedbackI18n } from "@/hooks/i18n";
import useContentSessionStore, {
  contentSessionKey,
  openContentSession,
} from "@/stores/useContentSessionStore";
import { beginPerfOperation } from "@/utils/perf-trace";

export default function useContentSession(
  contentId?: number,
  source?: Omit<ContentSessionTarget, "contentId">
) {
  const databaseName = useSettingStore(state => state.setting.database.active);
  const key = contentSessionKey(databaseName, contentId || 0);
  const entry = useContentSessionStore(state => state.entries[key]);
  const revision = useContentSessionStore(state => state.revision);
  const [error, setError] = useState<string>();
  const { t } = useHooksFeedbackI18n();
  const sourceRef = useRef(source);
  sourceRef.current = source;
  useEffect(() => {
    if (!contentId) return;
    let active = true;
    const operation = beginPerfOperation("content.open", { contentId });
    void operation
      .stage("content.session", () =>
        openContentSession(databaseName, { contentId, ...sourceRef.current })
      )
      .then(() => {
        operation.end();
        if (active) setError(undefined);
      })
      .catch(failure => {
        operation.end("error");
        if (active) setError(failure instanceof Error ? failure.message : t("content.loadFailed"));
      });
    return () => {
      active = false;
      operation.end("cancelled");
    };
  }, [contentId, databaseName, revision, source?.sourceType, source?.sourceId]);
  return { entry, error, databaseName };
}
