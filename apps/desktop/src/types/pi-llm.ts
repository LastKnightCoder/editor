/**
 * LLM 设置模型 v2：字段与语义对齐 pi agent（@earendil-works/pi-ai）。
 * provider = createProvider 的直接输入；model 字段映射 pi Model 元数据
 * （samplingParams 承载 temperature、headers 承载自定义 User-Agent）。
 * 旧 ProviderConfig/ModelConfig 由 llmSettingsMigration 一次性转化，不留兼容层。
 */

/** pi 的线协议实现（原 messageFormat × apiProtocol 二维组合的收敛） */
export type PiApiKind = "openai-completions" | "openai-responses" | "anthropic-messages";

/** pi ThinkingLevel（off + 六档），映射模型侧推理力度 */
export type PiThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface LLMModelSetting {
  /** 请求体里的 model 名（原 ModelConfig.name），provider 内唯一 */
  id: string;
  /** 展示名，缺省同 id */
  name?: string;
  /** 是否支持推理输出（原 features.thinking） */
  reasoning: boolean;
  /** 输入模态（原 features.image / legacy multimodal 归并为 image） */
  input: ("text" | "image")[];
  /** 上下文窗口，单位 token；builtin 服务商由 pi 目录提供，仅自定义模型需要填 */
  contextWindow?: number;
  /** 最大输出 token；builtin 服务商由 pi 目录提供，仅自定义模型需要填 */
  maxTokens?: number;
  /** 推理力度档位，缺省交给 pi 按模型能力取默认 */
  thinkingLevel?: PiThinkingLevel;
  /** 采样参数直通 pi StreamOptions.samplingParams（temperature 等原 ModelConfig.temperature） */
  samplingParams?: Record<string, unknown>;
  /** 请求头覆盖（原 userAgent → headers["User-Agent"]） */
  headers?: Record<string, string>;
  /** OpenAI 兼容网关调谐标志（thinkingFormat / maxTokensField 等），未设项由 pi 按 baseUrl 自动推断 */
  compat?: Record<string, unknown>;
  /**
   * 兜底开关：剥离混在 content 正文里的 <think>...</think> 标签（裸 vLLM/SGLang 等未开
   * reasoning-parser 的端点）。默认关——正文合法出现标签字样会被误切；结构化
   * reasoning_content 字段由 pi 原生处理，与本开关无关
   */
  stripThinkTags?: boolean;
}

export interface LLMProviderSetting {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  api: PiApiKind;
  /** 对应 pi 内置服务商 id（如 deepseek/anthropic）：模型元数据（上下文/输出/推理档位/compat/单价）
   *  以目录为准，用户手填仅作目录未收录模型的兜底；缺省时主进程按 baseUrl 匹配内置目录推断 */
  builtin?: string;
  models: LLMModelSetting[];
}

/** 按功能分配模型（原 LLMUsageConfig，model 主键从 name 改为 id） */
export interface LLMUsageConfigV2 {
  providerId: string;
  modelId: string;
}

/** 单发请求（渲染进程 → 主进程 pi-ai 模块）：消息字段名对齐 pi 的 Message，单发场景 content 收窄为纯文本 */
export interface PiSingleShotRequest {
  requestId: string;
  providerId: string;
  modelId: string;
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  thinking?: PiThinkingLevel;
  temperature?: number;
}

export interface PiSingleShotOutcome {
  ok: boolean;
  message?: import("@earendil-works/pi-ai").AssistantMessage;
  error?: string;
}
