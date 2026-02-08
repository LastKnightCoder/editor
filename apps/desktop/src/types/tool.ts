export interface ToolParameterSchema {
  type: string;
  description?: string;
  enum?: string[];
  items?: ToolParameterSchema;
  properties?: Record<string, ToolParameterSchema>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

export interface ToolFunctionSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: ToolJsonSchema;
  };
}

export interface ToolJsonSchema {
  type: "object";
  description?: string;
  properties: Record<string, ToolParameterSchema>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

export interface ToolExecutionResult {
  content: string;
  reasoning?: string;
  metadata?: Record<string, unknown>;
  /** 标记此结果是否为参数错误（由 toolRegistry 统一判定） */
  isParameterError?: boolean;
}

export type ToolExecutor = (
  args: Record<string, unknown>,
) => Promise<ToolExecutionResult | string | null | undefined>;

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolJsonSchema;
  executor: ToolExecutor;
}

export interface ToolCallPayload {
  id: string;
  type?: string;
  function: {
    name: string;
    arguments?: string;
  };
}
