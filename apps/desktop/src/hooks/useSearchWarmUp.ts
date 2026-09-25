import { useEffect, useRef } from "react";
import { embeddingModelHealth, isEmbeddingModelDownloaded } from "@/commands/embedding-model";
import useEmbeddingConfig from "@/hooks/useEmbeddingConfig";
import useGlobalStateStore from "@/stores/useGlobalStateStore";
import useSettingStore from "@/stores/useSettingStore";
import { searchContent } from "@/utils/search";

const SEARCH_WARMUP_QUERY = "__tau_search_warmup__";

const useSearchWarmUp = () => {
  const modelInfo = useEmbeddingConfig();
  const activeDatabase = useSettingStore(state => state.setting.database.active);
  const databaseStatus = useGlobalStateStore(state =>
    activeDatabase ? state.databaseStatus[activeDatabase] : undefined
  );
  const warmedKeysRef = useRef<Set<string>>(new Set());
  const warmingKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!activeDatabase || databaseStatus !== "ready") {
      return;
    }

    const canWarmUpLocalEmbedding =
      !!modelInfo && modelInfo.providerType === "local_python" && !!modelInfo.model;

    const warmupKey = [
      activeDatabase,
      modelInfo?.configId || "",
      modelInfo?.providerType || "",
      modelInfo?.model || "",
      modelInfo?.devicePolicy || "auto",
      modelInfo?.localModelDir || "",
    ].join("|");

    if (warmedKeysRef.current.has(warmupKey) || warmingKeysRef.current.has(warmupKey)) {
      return;
    }
    warmingKeysRef.current.add(warmupKey);

    let cancelled = false;

    const warmup = async () => {
      try {
        let embeddingModelInfo: NonNullable<typeof modelInfo> | undefined;

        if (canWarmUpLocalEmbedding) {
          const downloaded = await isEmbeddingModelDownloaded(modelInfo.model);
          if (downloaded && !cancelled) {
            const result = await embeddingModelHealth(
              modelInfo.model,
              modelInfo.devicePolicy || "auto"
            );

            if (!cancelled && !result.success) {
              console.warn("[SearchWarmUp] embedding 预热失败:", result.error || "unknown");
            }

            embeddingModelInfo = modelInfo;
          }
        }

        if (cancelled) {
          return;
        }

        await searchContent({
          query: SEARCH_WARMUP_QUERY,
          limit: 1,
          ...(embeddingModelInfo ? { modelInfo: embeddingModelInfo } : {}),
        });
        if (!cancelled) {
          warmedKeysRef.current.add(warmupKey);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("[SearchWarmUp] 预热异常:", error);
        }
      } finally {
        warmingKeysRef.current.delete(warmupKey);
      }
    };

    void warmup();

    return () => {
      cancelled = true;
    };
  }, [activeDatabase, databaseStatus, modelInfo]);
};

export default useSearchWarmUp;
