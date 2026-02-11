import type { EmbeddingProviderType } from "@/types/embedding";

export interface ConfigItem {
  id: string;
  name: string;
  providerType?: EmbeddingProviderType;
  source?: "modelscope" | "huggingface";
  apiKey: string;
  baseUrl: string;
  localModelDir?: string;
  batchSize?: number;
  devicePolicy?: "auto" | "cpu" | "cuda";
  models: ModelItem[];
  currentModel?: string;
}

export interface ModelItem {
  name: string;
  description: string;
  contextLength: number;
  distance: number;
  features: {
    multimodal: boolean;
  };
}

export interface ConfigFormData {
  name: string;
  providerType: EmbeddingProviderType;
  source?: "modelscope" | "huggingface";
  apiKey: string;
  baseUrl: string;
  localModelDir?: string;
  batchSize?: number;
  devicePolicy?: "auto" | "cpu" | "cuda";
  id?: string;
}

export interface ModelFormData {
  name: string;
  description: string;
  contextLength: number;
  distance: number;
  features: {
    multimodal: boolean;
  };
}
