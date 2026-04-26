import type {
  AgentTool,
  AgentToolCall,
  AgentToolExecutionContext,
  AgentToolExecutionResult,
  AgentToolSchema,
} from "../types";

const safeStringify = (payload: unknown) => {
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
};

export class ToolSnapshot {
  private readonly toolsByName: Map<string, AgentTool>;

  constructor(tools: AgentTool[]) {
    this.toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
  }

  getTools(): AgentTool[] {
    return Array.from(this.toolsByName.values());
  }

  getToolSchemas(): AgentToolSchema[] {
    return this.getTools().map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  findTool(name: string): AgentTool | undefined {
    return this.toolsByName.get(name);
  }

  async executeToolCall(
    call: AgentToolCall,
    options?: Omit<
      AgentToolExecutionContext,
      "toolName" | "source" | "toolCallId"
    >,
  ): Promise<AgentToolExecutionResult | null> {
    const tool = this.findTool(call.function.name);
    if (!tool) {
      return {
        content: `未找到名为 ${call.function.name} 的工具`,
      };
    }

    let parsedArgs: Record<string, unknown> = {};
    if (call.function.arguments) {
      try {
        parsedArgs =
          call.function.arguments.trim().length > 0
            ? JSON.parse(call.function.arguments)
            : {};
      } catch (error) {
        return {
          content: `参数解析失败: ${(error as Error).message}`,
          isParameterError: true,
        };
      }
    }

    const result = await tool.execute(parsedArgs, {
      toolCallId: call.id,
      toolName: tool.name,
      source: tool.source,
      signal: options?.signal,
      conversationKey: options?.conversationKey,
      toolContext: options?.toolContext,
    });

    if (!result) {
      return {
        content: "工具执行成功，但未返回结果",
      };
    }

    if (typeof result === "string") {
      return {
        content: result,
      };
    }

    return {
      content:
        typeof result.content === "string"
          ? result.content
          : safeStringify(result.content),
      reasoning: result.reasoning,
      metadata: result.metadata,
      isParameterError: result.isParameterError,
      isCancelled: result.isCancelled,
    };
  }
}
