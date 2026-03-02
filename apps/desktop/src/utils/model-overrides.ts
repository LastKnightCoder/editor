import type { ReasoningEffort } from "@/types/llm";

/**
 * 模型请求上下文，用于确定模型特定的参数设置
 */
export interface ModelRequestContext {
  modelName: string;
  reasoningEffort?: ReasoningEffort;
}

/**
 * 模型请求参数覆盖配置
 * 返回的值会覆盖默认的请求参数
 */
export interface ModelRequestOverrides {
  temperature?: number;
  top_p?: number;
  reasoning_effort?: ReasoningEffort;
  frequency_penalty?: number;
  thinking?: { type: "enabled" | "disabled" };
}

/**
 * 根据模型名称和请求上下文获取模型特定的参数覆盖配置
 *
 * 支持的模型系列：
 * - Kimi: 使用 thinking 参数替代 reasoning_effort，思考模式温度为 1，普通模式为 0.6
 * - Claude: 部分渠道不允许同时设置 temperature 和 top_p
 * - OpenAI o 系列 (o1, o3, o4) 和 GPT-5: 不支持 temperature 参数
 * - Gemini: 不支持 frequency_penalty 参数
 *
 * @param context - 模型请求上下文
 * @returns 需要覆盖的参数配置
 */
export function getModelRequestOverrides(
  context: ModelRequestContext,
): ModelRequestOverrides {
  const { modelName, reasoningEffort } = context;
  const normalizedModelName = modelName.toLowerCase();
  const isThinking = reasoningEffort && reasoningEffort !== "none";

  // Kimi 模型
  if (normalizedModelName.startsWith("kimi")) {
    return {
      temperature: isThinking ? 1 : 0.6, // 思考模型用 1，普通用 0.6
      top_p: 0.95,
      reasoning_effort: undefined, // Kimi 不支持此参数，改用 thinking
      thinking: { type: isThinking ? "enabled" : "disabled" },
    };
  }

  // Claude 模型（部分渠道不允许同时传 temperature 和 top_p）
  if (normalizedModelName.includes("claude")) {
    return {
      top_p: undefined,
    };
  }

  // OpenAI o 系列和 GPT-5（不支持温度）
  if (
    ["o1", "o3", "o4", "gpt-5"].some((p) => normalizedModelName.startsWith(p))
  ) {
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
