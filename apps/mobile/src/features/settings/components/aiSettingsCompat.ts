const LLM_FEATURE_KEY_LIST = [
  "chat",
  "titleSummary",
  "aiContinueWrite",
  "webClip",
  "podcastGeneration",
  "contentPolish",
  "flashcardGeneration",
  "aiJudgement",
  "autoTagging",
  "transcriptionOptimization",
  "videoSummary",
  "vibeLearningImageDescription",
  "vibeLearningDocSummary",
] as const;

export type LlmFeatureKey = (typeof LLM_FEATURE_KEY_LIST)[number];

export const LLM_FEATURE_KEYS = [...LLM_FEATURE_KEY_LIST];

export type LlmModelFeatures = {
  online: boolean;
  thinking: boolean;
  image: boolean;
  video: boolean;
  audio: boolean;
  file: boolean;
  multimodal?: boolean;
};

export type LlmModelConfig = {
  name: string;
  description: string;
  features: LlmModelFeatures;
};

export type LlmProviderConfig = {
  id: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  models: LlmModelConfig[];
};

export type LlmUsageConfig = {
  providerId: string;
  modelName: string;
};

export type LlmUsageSettings = Record<LlmFeatureKey, LlmUsageConfig | null>;

export type EmbeddingModelConfig = {
  name: string;
  description: string;
  contextLength: number;
  distance: number;
  features: {
    multimodal: boolean;
  };
};

export type EmbeddingApiConfig = {
  id: string;
  name: string;
  providerType: string;
  apiKey: string;
  baseUrl: string;
  source?: "modelscope" | "huggingface";
  batchSize?: number;
  devicePolicy?: "auto" | "cpu" | "cuda";
  currentModel: string;
  models: EmbeddingModelConfig[];
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as UnknownRecord;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isOneOf<T extends string>(
  value: string,
  candidates: readonly T[],
): value is T {
  return (candidates as readonly string[]).includes(value);
}

function normalizeLlmModelFeatures(input: unknown): LlmModelFeatures {
  const source = asRecord(input);
  const image =
    asBoolean(source.image, false) || asBoolean(source.multimodal, false);
  return {
    online: asBoolean(source.online, false),
    thinking: asBoolean(source.thinking, false),
    image,
    video: asBoolean(source.video, false),
    audio: asBoolean(source.audio, false),
    file: asBoolean(source.file, false),
    multimodal: asBoolean(source.multimodal, false),
  };
}

function normalizeLlmModel(input: unknown): LlmModelConfig | null {
  const source = asRecord(input);
  const name = asString(source.name).trim();
  if (!name) {
    return null;
  }
  return {
    name,
    description: asString(source.description).trim(),
    features: normalizeLlmModelFeatures(source.features),
  };
}

function normalizeEmbeddingModel(input: unknown): EmbeddingModelConfig | null {
  const source = asRecord(input);
  const name = asString(source.name).trim();
  if (!name) {
    return null;
  }
  const features = asRecord(source.features);
  return {
    name,
    description: asString(source.description).trim(),
    contextLength: asNumber(source.contextLength, 0),
    distance: asNumber(source.distance, 0),
    features: {
      multimodal: asBoolean(features.multimodal, false),
    },
  };
}

export function normalizeLlmConfigs(input: unknown): LlmProviderConfig[] {
  if (!Array.isArray(input)) return [];
  const next: LlmProviderConfig[] = [];
  for (const item of input) {
    const source = asRecord(item);
    const id = asString(source.id).trim() || createId();
    const name = asString(source.name).trim();
    const models = (Array.isArray(source.models) ? source.models : [])
      .map(normalizeLlmModel)
      .filter((value): value is LlmModelConfig => value !== null);
    next.push({
      id,
      name: name || "未命名配置",
      apiKey: asString(source.apiKey),
      baseUrl: asString(source.baseUrl),
      models,
    });
  }
  return next;
}

export function normalizeLlmUsageSettings(input: unknown): LlmUsageSettings {
  const source = asRecord(input);
  const next = {} as LlmUsageSettings;
  for (const key of LLM_FEATURE_KEY_LIST) {
    const raw = source[key];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      next[key] = null;
      continue;
    }
    const usage = asRecord(raw);
    const providerId = asString(usage.providerId).trim();
    const modelName = asString(usage.modelName).trim();
    next[key] =
      providerId && modelName
        ? {
            providerId,
            modelName,
          }
        : null;
  }
  return next;
}

export function reconcileLlmUsageSettings(
  configs: LlmProviderConfig[],
  usage: LlmUsageSettings,
): LlmUsageSettings {
  const next = {} as LlmUsageSettings;
  for (const key of LLM_FEATURE_KEY_LIST) {
    const current = usage[key];
    if (!current) {
      next[key] = null;
      continue;
    }
    const provider = configs.find((item) => item.id === current.providerId);
    if (!provider) {
      next[key] = null;
      continue;
    }
    const hasCurrentModel = provider.models.some(
      (model) => model.name === current.modelName,
    );
    if (hasCurrentModel) {
      next[key] = current;
      continue;
    }
    next[key] =
      provider.models.length > 0
        ? {
            providerId: provider.id,
            modelName: provider.models[0].name,
          }
        : null;
  }
  return next;
}

export function normalizeEmbeddingApiConfigs(
  input: unknown,
): EmbeddingApiConfig[] {
  if (!Array.isArray(input)) return [];
  const sourceCandidates = ["modelscope", "huggingface"] as const;
  const deviceCandidates = ["auto", "cpu", "cuda"] as const;
  const next: EmbeddingApiConfig[] = [];
  for (const item of input) {
    const source = asRecord(item);
    const providerType = asString(source.providerType, "remote_openai");
    if (providerType === "local_python") {
      continue;
    }
    const id = asString(source.id).trim() || createId();
    const models = (Array.isArray(source.models) ? source.models : [])
      .map(normalizeEmbeddingModel)
      .filter((value): value is EmbeddingModelConfig => value !== null);
    const currentModel = asString(source.currentModel).trim();
    const fallbackModel = models[0]?.name ?? "";
    const sourceValue = asString(source.source);
    const devicePolicyValue = asString(source.devicePolicy);
    next.push({
      id,
      name: asString(source.name).trim() || "未命名配置",
      providerType: providerType || "remote_openai",
      apiKey: asString(source.apiKey),
      baseUrl: asString(source.baseUrl),
      source: isOneOf(sourceValue, sourceCandidates) ? sourceValue : undefined,
      batchSize: asNumber(source.batchSize, 0) || undefined,
      devicePolicy: isOneOf(devicePolicyValue, deviceCandidates)
        ? devicePolicyValue
        : undefined,
      currentModel: currentModel || fallbackModel,
      models,
    });
  }
  return next;
}

export function resolveEmbeddingCurrentConfig(
  currentConfigId: unknown,
  configs: EmbeddingApiConfig[],
): string {
  if (configs.length === 0) {
    return asString(currentConfigId);
  }
  const currentId = asString(currentConfigId).trim();
  if (currentId && configs.some((item) => item.id === currentId)) {
    return currentId;
  }
  return configs[0].id;
}

export function createId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
