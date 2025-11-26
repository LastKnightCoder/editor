import type {
  ToolCallPayload,
  ToolDefinition,
  ToolExecutionResult,
  ToolFunctionSchema,
} from "@/types";

interface RegisteredTool extends ToolDefinition {
  source: string;
  enabled: boolean;
}

const safeStringify = (payload: unknown) => {
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
};

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  registerTools(
    source: string,
    definitions: ToolDefinition[],
    enabled = true,
  ): void {
    console.debug("[MCP] register tools", {
      source,
      count: definitions.length,
      toolNames: definitions.map((def) => def.name),
      enabled,
    });
    definitions.forEach((definition) => {
      const existing = this.tools.get(definition.name);
      if (existing && existing.source !== source) {
        console.warn("[MCP] duplicate tool name skipped", {
          name: definition.name,
          existingSource: existing.source,
          incomingSource: source,
        });
        return;
      }

      this.tools.set(definition.name, {
        ...definition,
        source,
        enabled,
      });
    });
  }

  clearSource(source: string): void {
    const removed: string[] = [];
    for (const [key, tool] of this.tools.entries()) {
      if (tool.source === source) {
        this.tools.delete(key);
        removed.push(key);
      }
    }
    if (removed.length > 0) {
      console.debug("[MCP] clear tools", { source, removed });
    }
  }

  setSourceEnabled(source: string, enabled: boolean): void {
    for (const tool of this.tools.values()) {
      if (tool.source === source) {
        tool.enabled = enabled;
      }
    }
    console.debug("[MCP] set source enabled", { source, enabled });
  }

  getToolSchemas(): ToolFunctionSchema[] {
    return Array.from(this.tools.values())
      .filter((tool) => tool.enabled)
      .map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
  }

  async executeToolCall(
    call: ToolCallPayload,
  ): Promise<ToolExecutionResult | null> {
    const tool = this.tools.get(call.function.name);
    if (!tool) {
      console.warn("[MCP] tool not found", call.function.name);
      // 工具未找到是不可重试的错误，返回错误信息
      return {
        content: `未找到名为 ${call.function.name} 的工具`,
      };
    }

    if (!tool.enabled) {
      // 工具未启用是不可重试的错误，返回错误信息
      return {
        content: `工具 ${tool.name} 当前未启用`,
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
        // 参数解析失败是可重试的错误，抛出异常以触发重试逻辑
        throw new Error(
          `Invalid arguments: 无法解析工具参数 - ${(error as Error).message}`,
        );
      }
    }

    console.debug("[MCP] execute tool", {
      tool: tool.name,
      source: tool.source,
      args: parsedArgs,
    });

    try {
      const result = await tool.executor(parsedArgs);
      console.debug("[MCP] tool execution result", {
        tool: tool.name,
        source: tool.source,
        result,
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
      };
    } catch (error) {
      // 工具执行失败，检查是否是参数相关的可重试错误
      const errorMsg = (error as Error).message.toLowerCase();
      const isRetryableError =
        errorMsg.includes("invalid") ||
        errorMsg.includes("missing") ||
        errorMsg.includes("required") ||
        errorMsg.includes("argument") ||
        errorMsg.includes("parameter");

      if (isRetryableError) {
        // 可重试错误：重新抛出以触发重试逻辑
        throw new Error(
          `Invalid arguments for function ${tool.name}: ${(error as Error).message}`,
        );
      } else {
        // 不可重试错误（如网络错误、权限错误等）：返回错误信息
        console.error("[MCP] tool execution error", {
          tool: tool.name,
          error,
        });
        return {
          content: `工具执行失败: ${(error as Error).message}`,
        };
      }
    }
  }
}

const registry = new ToolRegistry();

export default registry;
