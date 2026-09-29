/**
 * 模型用量审计：主进程记录每次模型调用（token / 费用 / 耗时 / 来源），存全局 usage.db。
 * 只记元数据，不存 prompt 与回复原文；会话类调用靠 sessionId 回溯 pi 会话文件。
 */

/** 调用来源：渲染端随请求透传，主进程据此归属到功能与知识库 */
export interface UsageSource {
  /** 功能名，尽量复用 llmUsageSettings 的槽名（chat / titleSummary / ...） */
  feature?: string;
  /** 关联实体（内容 id、项目 id 等），便于回溯 */
  entityId?: string;
  /** 知识库名（不带 .db）；缺省取当前激活库 */
  library?: string;
}

export type ModelUsageKind = "llm" | "embedding" | "tts" | "image";
export type ModelUsageStatus = "ok" | "error" | "aborted";
/** catalog = pi 目录单价算出；none = 无价格信息 */
export type ModelUsageCostSource = "catalog" | "custom" | "none";

export interface ModelUsageEvent {
  /** ULID，跨设备全局唯一，按时间有序 */
  eventId: string;
  ts: number;
  deviceId: string;
  library: string | null;
  kind: ModelUsageKind;
  providerId: string;
  /** 记录时的服务商展示名（服务商被删后仍可读） */
  providerName: string | null;
  model: string;
  feature: string;
  /** 会话类别（main-chat / pdf-chat / browser ...），单发为 null */
  scope: string | null;
  sessionId: string | null;
  entityId: string | null;
  status: ModelUsageStatus;
  errorMessage: string | null;
  latencyMs: number | null;
  ttftMs: number | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  /** 非 token 计量（语音字符数、图片张数） */
  units: number | null;
  cost: number;
  costSource: ModelUsageCostSource;
}

export interface ModelUsageQuery {
  /** 起止时间（ms，含 from、不含 to） */
  from?: number;
  to?: number;
  library?: string;
  feature?: string;
  model?: string;
  status?: ModelUsageStatus;
  offset?: number;
  limit?: number;
}

export interface ModelUsageSummary {
  calls: number;
  errors: number;
  aborted: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  cost: number;
}

export interface ModelUsageListResult {
  total: number;
  items: ModelUsageEvent[];
}
