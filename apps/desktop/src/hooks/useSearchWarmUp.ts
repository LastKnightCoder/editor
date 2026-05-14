import { useEffect, useRef } from "react";
import {
  embeddingModelHealth,
  isEmbeddingModelDownloaded,
} from "@/commands/embedding-model";
import useEmbeddingConfig from "@/hooks/useEmbeddingConfig";
import { searchContent } from "@/utils/search";

const SEARCH_WARMUP_QUERY = "__tau_search_warmup__";

const useSearchWarmUp = () => {
  const modelInfo = useEmbeddingConfig();
  const warmupKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const canWarmUpLocalEmbedding =
      !!modelInfo &&
      modelInfo.providerType === "local_python" &&
      !!modelInfo.model;

    const warmupKey = [
      modelInfo?.configId || "",
      modelInfo?.providerType || "",
      modelInfo?.model || "",
      modelInfo?.devicePolicy || "auto",
      modelInfo?.localModelDir || "",
    ].join("|");

    if (warmupKeysRef.current.has(warmupKey)) {
      return;
    }
    warmupKeysRef.current.add(warmupKey);

    let cancelled = false;

    const warmup = async () => {
      try {
        let searchModelInfo: NonNullable<typeof modelInfo> | undefined;

        if (canWarmUpLocalEmbedding) {
          const downloaded = await isEmbeddingModelDownloaded(modelInfo.model);
          if (downloaded && !cancelled) {
            const result = await embeddingModelHealth(
              modelInfo.model,
              modelInfo.devicePolicy || "auto",
            );

            if (!cancelled && !result.success) {
              console.warn(
                "[SearchWarmUp] embedding 预热失败:",
                result.error || "unknown",
              );
            }

            searchModelInfo = modelInfo;
          }
        }

        if (cancelled) {
          return;
        }

        await searchContent({
          query: SEARCH_WARMUP_QUERY,
          limit: 1,
          ...(searchModelInfo ? { modelInfo: searchModelInfo } : {}),
        });
      } catch (error) {
        if (!cancelled) {
          console.warn("[SearchWarmUp] 预热异常:", error);
        }
      }
    };

    void warmup();

    return () => {
      cancelled = true;
    };
  }, [modelInfo]);
};

export default useSearchWarmUp;
