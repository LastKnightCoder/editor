/**
 * LLM 设置模型 v2：字段与语义对齐 pi agent（@earendil-works/pi-ai）。
 * provider = createProvider 的直接输入；model 字段映射 pi Model 元数据
 * （samplingParams 承载 temperature、headers 承载自定义 User-Agent）。
 * 旧 ProviderConfig/ModelConfig 由 llmSettingsMigration 一次性转化，不留兼容层。
 */

import type { ThinkingLevel } from "@tau/shared";

/** pi 的线协议实现（原 messageFormat × apiProtocol 二维组合的收敛） */
export type PiApiKind = "openai-completions" | "openai-responses" | "anthropic-messages";

/**
 * 思考档位（off + 六档），与 pi 的 ThinkingLevel 逐项对齐。
 * 唯一定义在 @tau/shared（输入框组件也要用，且那边不能依赖 pi 包），
 * 此处只是桌面端沿用的名字——不是另一套取值。
 */
export type PiThinkingLevel = ThinkingLevel;

/**
 * pi 内置服务商目录项（主进程查询、渲染端只读）。
 * 目录里有 10 种 api，只暴露本项目支持的三种（PiApiKind）能命中的服务商与模型，
 * 否则界面会让用户建出跑不起来的服务商。
 */
export interface PiCatalogProvider {
  /** 内置服务商 id，写入 LLMProviderSetting.builtin */
  id: string;
  name: string;
  /** 官方 baseUrl；网关类服务商（Cloudflare/OpenCode 等）没有，需用户自填 */
  baseUrl?: string;
  /** 服务商级 api 兜底：取其可用模型里占多数的那种 */
  api: PiApiKind;
  /** 该服务商下受支持的模型数 */
  modelCount: number;
}

/** pi 内置目录的模型元数据（勾选模型时带入设置，免手填） */
export interface PiCatalogModel {
  id: string;
  name: string;
  api: PiApiKind;
  reasoning: boolean;
  input: ("text" | "image")[];
  contextWindow: number;
  maxTokens: number;
  /** 每百万 token 价格，用于界面提示；无价格信息时为空 */
  cost?: { input: number; output: number };
  /** 该模型真实支持的推理档位（pi getSupportedThinkingLevels），空数组表示不支持推理 */
  thinkingLevels: PiThinkingLevel[];
}

/**
 * 从服务商 `/models` 接口实时拉到的模型（M3-f）：覆盖目录外的自建服务（Ollama/LM Studio/私有网关）
 * 与目录落后于服务商新模型的情况。目录命中时元数据取目录（fromCatalog=true，与勾选目录同等可信）；
 * 否则只有接口自报的字段，缺的保持为空，不瞎猜默认值。
 */
export interface PiDiscoveredModel {
  id: string;
  name: string;
  fromCatalog: boolean;
  api?: PiApiKind;
  reasoning?: boolean;
  input?: ("text" | "image")[];
  contextWindow?: number;
  maxTokens?: number;
  cost?: { input: number; output: number };
}

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
  /**
   * 该模型的线协议。目录命中时以目录为准，此字段是目录不可用时的兜底——
   * 混合 api 的服务商（OpenRouter 同时有 anthropic-messages 与 openai-completions 模型）
   * 光靠服务商级 api 会落到错误协议。从目录勾选模型时记下，手填模型可留空。
   */
  api?: PiApiKind;
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
