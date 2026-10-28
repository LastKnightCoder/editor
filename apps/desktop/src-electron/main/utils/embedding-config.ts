import {
  DEFAULT_LOCAL_EMBEDDING_DISTANCE,
  DEFAULT_PLUGIN_EMBEDDING_DISTANCE,
} from "@/constants/embedding";
import type {
  EmbeddingDevicePolicy,
  EmbeddingProviderKind,
  EmbeddingSetting,
} from "@/types/embedding";

export type { EmbeddingDevicePolicy, EmbeddingProviderKind, EmbeddingSetting };

/** 旧本地嵌入配置 id：设置中已不再存储，仅作为本地指纹字面量保留（见 buildLocalEmbeddingFingerprint） */
const LEGACY_LOCAL_EMBEDDING_CONFIG_ID = "embedding-default-local";

/** 本地嵌入管线版本；2 = 补 <s> + 480 token 分窗（修复 node-llama-cpp 下 bge-m3 长文本向量塌缩） */
export const LOCAL_EMBEDDING_PIPELINE = 2;

export type EmbeddingFingerprint = string;

export interface ResolvedEmbeddingConfig {
  provider: EmbeddingProviderKind;
  /** provider === "plugin" 时的来源插件 */
  pluginId?: string;
  model: string;
  dimensions: number;
  distance: number;
  devicePolicy: EmbeddingDevicePolicy;
  batchSize: number;
  fingerprint: EmbeddingFingerprint;
}

interface SettingWithEmbedding {
  embedding?: EmbeddingSetting;
}

export const DEFAULT_EMBEDDING_LOCAL_SETTING: EmbeddingSetting["local"] = {
  source: "modelscope",
  devicePolicy: "auto",
  batchSize: 8,
};

/* ── 旧 embeddingProvider 结构：仅在升级时读取，升级完成后写入边界拒绝旧键 ── */

type LegacyEmbeddingProviderType = "remote_openai" | "local_python";

interface LegacyEmbeddingSettingConfig {
  id: string;
  providerType?: LegacyEmbeddingProviderType;
  source?: "modelscope" | "huggingface";
  batchSize?: number;
  devicePolicy?: EmbeddingDevicePolicy;
  currentModel?: string;
  models?: Array<{ name: string; contextLength: number }>;
}

interface LegacyEmbeddingProviderSetting {
  currentConfigId?: string;
  configs?: LegacyEmbeddingSettingConfig[];
}

interface SettingWithLegacyEmbeddingProvider {
  embeddingProvider?: LegacyEmbeddingProviderSetting;
}

const normalizeDevicePolicy = (value: unknown): EmbeddingDevicePolicy =>
  value === "cpu" || value === "cuda" ? value : "auto";

const isLegacyLocalConfig = (
  config: LegacyEmbeddingSettingConfig | undefined
): config is LegacyEmbeddingSettingConfig =>
  !!config &&
  (config.providerType === "local_python" || config.id === LEGACY_LOCAL_EMBEDDING_CONFIG_ID);

/**
 * 旧 `embeddingProvider` 键的一次性升级（原地改写，返回是否发生变化）：
 * 本地生效配置保留并冻结维度（指纹与旧版一致，存量本地索引不重建），旧 API 配置直接丢弃。
 * 非普通对象输入直接返回 false，由调用侧的设置校验负责报错。
 */
export const upgradeEmbeddingSetting = (setting: unknown): boolean => {
  if (!setting || typeof setting !== "object" || Array.isArray(setting)) return false;
  const record = setting as Record<string, unknown>;
  if (!Object.hasOwn(record, "embeddingProvider")) {
    return false;
  }
  const legacy = record.embeddingProvider as LegacyEmbeddingProviderSetting | undefined;
  delete record.embeddingProvider;

  const configs = legacy?.configs ?? [];
  const currentConfig = configs.find(item => item.id === legacy?.currentConfigId);
  const legacyLocal = configs.find(isLegacyLocalConfig);

  let active: EmbeddingSetting["active"] = null;
  if (isLegacyLocalConfig(currentConfig) && currentConfig.currentModel) {
    const dimensions = Math.floor(
      currentConfig.models?.find(item => item.name === currentConfig.currentModel)?.contextLength ??
        0
    );
    if (dimensions > 0) {
      active = { provider: "local", model: currentConfig.currentModel, dimensions };
    }
  }

  record.embedding = {
    active,
    local: {
      source: legacyLocal?.source === "huggingface" ? "huggingface" : "modelscope",
      devicePolicy: normalizeDevicePolicy(legacyLocal?.devicePolicy),
      batchSize:
        legacyLocal?.batchSize && legacyLocal.batchSize > 0
          ? legacyLocal.batchSize
          : DEFAULT_EMBEDDING_LOCAL_SETTING.batchSize,
    },
    plugins: {},
  };
  return true;
};

/** 本地指纹沿用旧版字面量（providerType/configId 等旧字段名与键序），以免存量本地索引重建 */
const buildLocalEmbeddingFingerprint = (
  model: string,
  dimensions: number,
  devicePolicy: EmbeddingDevicePolicy
): EmbeddingFingerprint =>
  JSON.stringify({
    providerType: "local_python",
    configId: LEGACY_LOCAL_EMBEDDING_CONFIG_ID,
    model,
    dimensions,
    distance: DEFAULT_LOCAL_EMBEDDING_DISTANCE,
    devicePolicy,
    localModelDir: "",
    baseUrl: "",
    runtime: "llama",
    pipeline: LOCAL_EMBEDDING_PIPELINE,
  });

export const resolveEmbeddingConfig = (
  setting: (SettingWithEmbedding & SettingWithLegacyEmbeddingProvider) | null | undefined
): ResolvedEmbeddingConfig | null => {
  const active = setting?.embedding?.active;
  if (!active?.model || !(active.dimensions > 0)) {
    return null;
  }
  const provider: EmbeddingProviderKind = active.provider === "plugin" ? "plugin" : "local";
  const pluginId = active.pluginId?.trim();
  if (provider === "plugin" && !pluginId) {
    return null;
  }

  const local = setting?.embedding?.local;
  const devicePolicy = normalizeDevicePolicy(local?.devicePolicy);
  const batchSize =
    local?.batchSize && local.batchSize > 0
      ? local.batchSize
      : DEFAULT_EMBEDDING_LOCAL_SETTING.batchSize;
  const dimensions = Math.floor(active.dimensions);

  if (provider === "plugin") {
    return {
      provider,
      pluginId,
      model: active.model,
      dimensions,
      distance: DEFAULT_PLUGIN_EMBEDDING_DISTANCE,
      devicePolicy,
      batchSize,
      fingerprint: JSON.stringify({ provider, pluginId, model: active.model, dimensions }),
    };
  }

  return {
    provider,
    model: active.model,
    dimensions,
    distance: DEFAULT_LOCAL_EMBEDDING_DISTANCE,
    devicePolicy,
    batchSize,
    fingerprint: buildLocalEmbeddingFingerprint(active.model, dimensions, devicePolicy),
  };
};

export const isLocalEmbeddingConfig = (
  config: ResolvedEmbeddingConfig | null | undefined
): config is ResolvedEmbeddingConfig => config?.provider === "local";
