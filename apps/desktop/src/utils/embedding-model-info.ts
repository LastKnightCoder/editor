import type { ISetting } from "@/stores/useSettingStore";
import type { SearchParams } from "@/types/search";
import type { EmbeddingActiveModel } from "@/types/embedding";
import {
  DEFAULT_LOCAL_EMBEDDING_DISTANCE,
  DEFAULT_PLUGIN_EMBEDDING_DISTANCE,
} from "@/constants/embedding";

type EmbeddingModelInfo = SearchParams["modelInfo"];

const resolveEmbeddingModelInfoFromActive = (
  active: EmbeddingActiveModel | null | undefined,
  local: ISetting["embedding"]["local"] | undefined
): EmbeddingModelInfo | undefined => {
  if (!active?.model || !(active.dimensions > 0)) {
    return undefined;
  }
  if (active.provider === "plugin" && !active.pluginId?.trim()) {
    return undefined;
  }
  return {
    provider: active.provider,
    pluginId: active.provider === "plugin" ? active.pluginId!.trim() : undefined,
    model: active.model,
    distance:
      active.provider === "plugin"
        ? DEFAULT_PLUGIN_EMBEDDING_DISTANCE
        : DEFAULT_LOCAL_EMBEDDING_DISTANCE,
    dimensions: active.dimensions,
    batchSize: local?.batchSize,
    devicePolicy: local?.devicePolicy || "auto",
  };
};

export const resolveEmbeddingModelInfoFromSetting = (setting: {
  embedding?: ISetting["embedding"];
}): EmbeddingModelInfo | undefined =>
  resolveEmbeddingModelInfoFromActive(setting.embedding?.active, setting.embedding?.local);
