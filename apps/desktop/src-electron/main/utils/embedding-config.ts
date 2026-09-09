import { DEFAULT_LOCAL_EMBEDDING_DISTANCE, LOCAL_EMBEDDING_CONFIG_ID } from "@/constants/embedding";
import type { EmbeddingProviderType } from "@/types/embedding";

export type { EmbeddingProviderType };

interface EmbeddingSettingModel {
  name: string;
  contextLength: number;
  distance?: number;
}

interface EmbeddingSettingConfig {
  id: string;
  providerType?: EmbeddingProviderType;
  apiKey?: string;
  baseUrl?: string;
  localModelDir?: string;
  batchSize?: number;
  devicePolicy?: "auto" | "cpu" | "cuda";
  currentModel?: string;
  models?: EmbeddingSettingModel[];
}

interface EmbeddingProviderSetting {
  currentConfigId?: string;
  configs?: EmbeddingSettingConfig[];
}

interface SettingWithEmbeddingProvider {
  embeddingProvider?: EmbeddingProviderSetting;
}

export interface EmbeddingFingerprintPayload {
  providerType: EmbeddingProviderType;
  configId: string;
  model: string;
  dimensions: number;
  distance: number;
  devicePolicy: "auto" | "cpu" | "cuda";
  localModelDir?: string;
  baseUrl?: string;
  /**
   * 推理运行时标识：llama（node-llama-cpp / GGUF）与旧 python（FlagEmbedding / torch）
   * 的向量不可混检，该字段变化会触发全量索引重建
   */
  runtime?: "llama" | "python";
}

export type EmbeddingFingerprint = string;

export interface ResolvedEmbeddingConfig {
  providerType: EmbeddingProviderType;
  configId: string;
  model: string;
  dimensions: number;
  distance: number;
  devicePolicy: "auto" | "cpu" | "cuda";
  batchSize: number;
  apiKey?: string;
  baseUrl?: string;
  localModelDir?: string;
  fingerprint: EmbeddingFingerprint;
}

const normalizeUrl = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }
  return value.trim().replace(/\/+$/, "");
};

const normalizePath = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
};

export const buildEmbeddingFingerprint = (
  payload: EmbeddingFingerprintPayload
): EmbeddingFingerprint => {
  return JSON.stringify({
    providerType: payload.providerType,
    configId: payload.configId,
    model: payload.model,
    dimensions: payload.dimensions,
    distance: payload.distance,
    devicePolicy: payload.devicePolicy,
    localModelDir: payload.localModelDir || "",
    baseUrl: payload.baseUrl || "",
    runtime: payload.runtime || "",
  });
};

export const resolveEmbeddingConfig = (
  setting: SettingWithEmbeddingProvider | null | undefined
): ResolvedEmbeddingConfig | null => {
  const provider = setting?.embeddingProvider;
  if (!provider?.currentConfigId || !provider.configs?.length) {
    return null;
  }

  const currentConfig = provider.configs.find(item => item.id === provider.currentConfigId);
  if (!currentConfig?.currentModel) {
    return null;
  }

  const currentModel = currentConfig.models?.find(item => item.name === currentConfig.currentModel);
  if (!currentModel?.contextLength || currentModel.contextLength <= 0) {
    return null;
  }

  const providerType: EmbeddingProviderType =
    currentConfig.providerType === "local_python" || currentConfig.id === LOCAL_EMBEDDING_CONFIG_ID
      ? "local_python"
      : "remote_openai";

  const normalizedBaseUrl = normalizeUrl(currentConfig.baseUrl);
  if (providerType === "remote_openai") {
    if (!currentConfig.apiKey?.trim() || !normalizedBaseUrl) {
      return null;
    }
  }

  const distance =
    currentModel.distance ||
    (providerType === "local_python" ? DEFAULT_LOCAL_EMBEDDING_DISTANCE : 0);

  const fingerprintPayload: EmbeddingFingerprintPayload = {
    providerType,
    configId: currentConfig.id,
    model: currentModel.name,
    dimensions: Math.floor(currentModel.contextLength),
    distance,
    devicePolicy: currentConfig.devicePolicy || "auto",
    localModelDir:
      providerType === "local_python" ? normalizePath(currentConfig.localModelDir) : undefined,
    baseUrl: providerType === "remote_openai" ? normalizedBaseUrl : undefined,
    // 本地向量现由 node-llama-cpp(GGUF) 产生，与旧 torch 向量不兼容
    runtime: providerType === "local_python" ? "llama" : undefined,
  };

  return {
    providerType,
    configId: currentConfig.id,
    model: currentModel.name,
    dimensions: Math.floor(currentModel.contextLength),
    distance,
    devicePolicy: currentConfig.devicePolicy || "auto",
    batchSize: currentConfig.batchSize || 8,
    apiKey: currentConfig.apiKey,
    baseUrl: normalizedBaseUrl,
    localModelDir: normalizePath(currentConfig.localModelDir),
    fingerprint: buildEmbeddingFingerprint(fingerprintPayload),
  };
};

export const isLocalEmbeddingConfig = (
  config: ResolvedEmbeddingConfig | null | undefined
): config is ResolvedEmbeddingConfig => {
  return config?.providerType === "local_python";
};
