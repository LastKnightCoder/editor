/**
 * OpenAI 系接口的 `reasoning_effort` 取值（旧链路专用：modules/llm.ts 的连接测试路径）。
 * 与界面/运行时的思考档位（@tau/shared ThinkingLevel，"off" 而非 "none"）刻意不共用类型——
 * 这是线协议字段，不是产品档位；旧链路随 M8 一起删除。
 */
export type LegacyReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";

/**
 * 模型请求上下文，用于确定模型特定的参数设置
 */
export interface ModelRequestContext {
  modelName: string;
  reasoningEffort?: LegacyReasoningEffort;
}

/**
 * 模型请求参数覆盖配置
 * 返回的值会覆盖默认的请求参数
 */
export interface ModelRequestOverrides {
  temperature?: number;
  top_p?: number;
  reasoning_effort?: Exclude<LegacyReasoningEffort, "none">;
  frequency_penalty?: number;
}

/**
 * 根据模型名称和请求上下文获取模型特定的参数覆盖配置
 *
 * 支持的模型系列：
 * - Claude: 部分渠道不允许同时设置 temperature 和 top_p
 * - OpenAI o 系列 (o1, o3, o4) 和 GPT-5: 不支持 temperature 参数
 * - Gemini: 不支持 frequency_penalty 参数
 *
 * @param context - 模型请求上下文
 * @returns 需要覆盖的参数配置
 */
export function getModelRequestOverrides(context: ModelRequestContext): ModelRequestOverrides {
  const { modelName } = context;
  const normalizedModelName = modelName.toLowerCase();

  // Claude 模型（部分渠道不允许同时传 temperature 和 top_p）
  if (normalizedModelName.includes("claude")) {
    return {
      top_p: undefined,
    };
  }

  // OpenAI o 系列和 GPT-5（不支持温度）
  if (["o1", "o3", "o4", "gpt-5"].some(p => normalizedModelName.startsWith(p))) {
    return {
      temperature: undefined,
    };
  }

  // Gemini（不支持 frequency_penalty）
  if (normalizedModelName.startsWith("gemini")) {
    return {
      frequency_penalty: undefined,
    };
  }

  // 默认设置：不覆盖任何参数
  return {};
}
