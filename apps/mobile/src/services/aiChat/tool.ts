import type { AiToolExecutionContext, AiToolResult, AiToolRisk } from "@tau/ai/contracts";

/** 宿主工具：工具名与桌面同名，模型看到的就是 name；id 带来源前缀以区分插件工具 */
export interface HostTool {
  name: string;
  risk: AiToolRisk;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(input: Record<string, unknown>, context: AiToolExecutionContext): Promise<AiToolResult>;
}

export const HOST_TOOL_SOURCE = "host";
export const hostToolId = (name: string) => `${HOST_TOOL_SOURCE}:${name}`;

export const ok = (value: unknown, metadata?: Record<string, unknown>): AiToolResult => ({
  content: JSON.stringify(value),
  ...(metadata ? { metadata } : {}),
});

/** 工具层错误以结构化结果回给模型，便于其修正后重试；不抛出成运行失败 */
export const failure = (code: string, message: string, extra?: Record<string, unknown>) =>
  ok({ success: false, errorCode: code, message, ...extra });

export const objectSchema = (
  properties: Record<string, unknown>,
  required: string[] = []
): Record<string, unknown> => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

export const text = (input: Record<string, unknown>, key: string) =>
  typeof input[key] === "string" ? (input[key] as string) : undefined;

export const integer = (input: Record<string, unknown>, key: string) => {
  const value = input[key];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
};
