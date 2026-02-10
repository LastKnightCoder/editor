import { useEffect, useRef } from "react";
import {
  embeddingModelHealth,
  isEmbeddingModelDownloaded,
} from "@/commands/embedding-model";
import useEmbeddingConfig from "@/hooks/useEmbeddingConfig";

const useEmbeddingWarmup = () => {
  const modelInfo = useEmbeddingConfig();
  const warmupKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (
      !modelInfo ||
      modelInfo.providerType !== "local_python" ||
      !modelInfo.model
    ) {
      return;
    }

    const warmupKey = [
      modelInfo.configId || "",
      modelInfo.model,
      modelInfo.devicePolicy || "auto",
      modelInfo.localModelDir || "",
    ].join("|");

    if (warmupKeysRef.current.has(warmupKey)) {
      return;
    }
    warmupKeysRef.current.add(warmupKey);

    let cancelled = false;

    const warmup = async () => {
      try {
        const downloaded = await isEmbeddingModelDownloaded(modelInfo.model);
        if (!downloaded || cancelled) {
          return;
        }

        const result = await embeddingModelHealth(
          modelInfo.model,
          modelInfo.devicePolicy || "auto",
        );

        if (!cancelled && !result.success) {
          console.warn(
            "[EmbeddingWarmup] 预热失败:",
            result.error || "unknown",
          );
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("[EmbeddingWarmup] 预热异常:", error);
        }
      }
    };

    void warmup();

    return () => {
      cancelled = true;
    };
  }, [modelInfo]);
};

export default useEmbeddingWarmup;
