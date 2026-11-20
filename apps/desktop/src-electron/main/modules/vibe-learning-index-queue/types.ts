import type { LlmRef, SettingForLlmSlots } from "../llm-usage-slot";
import type { ResolvedEmbeddingConfig } from "../../utils/embedding-config";
import type { EmbeddingTarget } from "../embedding-service";
import type { EmbeddingProviderKind } from "@/types/embedding";

export type EmbeddingConfig = ResolvedEmbeddingConfig;

export const toEmbeddingTarget = (config: EmbeddingConfig): EmbeddingTarget => ({
  provider: config.provider,

  pluginId: config.pluginId,

  model: config.model,

  dimensions: config.dimensions,

  batchSize: config.batchSize,

  devicePolicy: config.devicePolicy,
});

export interface TranscriptionConfig {
  model: string;

  modelDir: string;

  /** 断句优化模型；未分配时为 null（走句级转录、不做 LLM 优化） */

  llm: LlmRef | null;
}

export interface SettingForTranscription extends SettingForLlmSlots {
  transcription?: {
    currentModel?: string;
  };
}

export type ImageDescriptionConfig = LlmRef;

export type TaskType = "full" | "convert_only" | "index_only" | "embedding_only";

export type TaskStatus =
  | "pending"
  | "downloading" // 正在下载远程视频
  | "transcribing" // 正在转录音视频
  | "converting"
  | "optimizing_transcript" // 正在进行转录断句优化
  | "indexing"
  | "embedding"
  | "completed"
  | "failed";

export type EmbeddingSwitchReason =
  | "config_switch"
  | "model_switch"
  | "db_switch"
  | "startup_reconcile"
  | "sync_upload_reconnect"
  | "sync_download_reconnect";

export const VL_TASK_STALE_ERROR_CODE = "VL_TASK_STALE";

export class VibeLearningTaskStaleError extends Error {
  readonly code = VL_TASK_STALE_ERROR_CODE;

  constructor(resourceId: number, taskGeneration: number, currentGeneration: number) {
    super(
      `resource ${resourceId} task stale: taskGeneration=${taskGeneration}, currentGeneration=${currentGeneration}`
    );

    this.name = "VibeLearningTaskStaleError";
  }
}

export interface RebuildQueueForEmbeddingSwitchParams {
  dimensions: number;

  mainDbName?: string;

  reason?: EmbeddingSwitchReason;
}

export interface RebuildQueueForEmbeddingSwitchResult {
  reinitOk: boolean;

  queued: number;

  droppedPending: number;

  previousGeneration: number;

  currentGeneration: number;

  reason: EmbeddingSwitchReason;
}

export interface HandleEmbeddingSwitchByPolicyParams {
  mainDbName: string;

  dimensions: number;

  fingerprintChanged: boolean;

  provider: EmbeddingProviderKind;

  reason: EmbeddingSwitchReason;
}

export interface HandleEmbeddingSwitchByPolicyResult {
  reinitOk: boolean;

  queued: number;

  droppedPending: number;

  previousGeneration: number;

  currentGeneration: number;
}

export interface RecoverResourcesOptions {
  forceEmbedding?: boolean;
}

export interface IndexTask {
  resourceId: number;

  projectId: number;

  mainDbName: string;

  originalPath: string;

  resourceName: string; // 原始文件名

  markdownPath?: string;

  type: TaskType;

  status: TaskStatus;

  retryCount: number;

  generation: number;

  error?: string;
}

export type AddTaskResult =
  | { accepted: true; reason: "queued_new" | "updated_pending" }
  | {
      accepted: false;

      reason: "already_running";

      currentStatus: TaskStatus;
    };
