export type DevicePolicy = "auto" | "cpu" | "cuda";
export type InferencePriority = "background" | "interactive";

export interface EmbedTextsOptions {
  modelDir?: string;
  modelName: string;
  batchSize?: number;
  devicePolicy?: DevicePolicy;
  priority?: InferencePriority;
}

export interface EmbedTextsResult {
  embeddings: number[][];
  dimensions: number;
  device: string;
}

export interface EmbeddingHealth {
  loaded: boolean;
  model_path?: string;
  model_name?: string;
  device?: string;
  dimensions?: number;
}

export type InferenceInput = {
  modelPath: string;
  devicePolicy: DevicePolicy;
} & ({ kind: "embed"; text: string } | { kind: "warmup" });

export type InferenceRequest = InferenceInput & { id: number };
export type InferenceResult =
  { kind: "embed"; value: EmbedTextsResult } | { kind: "warmup"; value: EmbeddingHealth };
export type InferenceReply =
  | { kind: "ready" }
  | { kind: "result"; id: number; result: InferenceResult }
  | { kind: "error"; id: number; message: string };
