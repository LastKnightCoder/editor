import type {
  ToolCallPayload,
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolFunctionSchema,
} from "@/types";

export interface RegisteredTool extends ToolDefinition {
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
  /** 逐工具停用（按来源分组），与来源级开关叠加生效；独立于注册，重新注册后仍保留 */
  private disabledTools = new Map<string, Set<string>>();

  setDisabledTools(source: string, names: string[]): void {
    if (names.length > 0) this.disabledTools.set(source, new Set(names));
    else this.disabledTools.delete(source);
  }

  private isActive(tool: RegisteredTool): boolean {
    return tool.enabled && !this.disabledTools.get(tool.source)?.has(tool.name);
  }

  registerTools(source: string, definitions: ToolDefinition[], enabled = true): void {
    console.debug("[MCP] register tools", {
      source,
      count: definitions.length,
      toolNames: definitions.map(def => def.name),
      enabled,
    });
    definitions.forEach(definition => {
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

  hasSource(source: string): boolean {
    return Array.from(this.tools.values()).some(tool => tool.source === source);
  }

  hasEnabledTool(name: string): boolean {
    const tool = this.tools.get(name);
    return Boolean(tool && this.isActive(tool));
  }

  unregisterSource(source: string): void {
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
      .filter(tool => this.isActive(tool))
      .map(tool => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
  }

  getRegisteredTools(): RegisteredTool[] {
    return Array.from(this.tools.values()).map(tool => ({
      ...tool,
      enabled: this.isActive(tool),
    }));
  }

  async executeToolCall(
    call: ToolCallPayload,
    options?: {
      signal?: AbortSignal;
      conversationKey?: string;
      toolContext?: ToolExecutionContext["toolContext"];
    }
  ): Promise<ToolExecutionResult | null> {
    const tool = this.tools.get(call.function.name);
    if (!tool) {
      console.warn("[MCP] tool not found", call.function.name);
      // 工具未找到是不可重试的错误，返回错误信息
      return {
        content: `未找到名为 ${call.function.name} 的工具`,
      };
    }

    if (!this.isActive(tool)) {
      // 工具未启用是不可重试的错误，返回错误信息
      return {
        content: `工具 ${tool.name} 当前未启用`,
      };
    }

    let parsedArgs: Record<string, unknown> = {};
    if (call.function.arguments) {
      try {
        parsedArgs =
          call.function.arguments.trim().length > 0 ? JSON.parse(call.function.arguments) : {};
      } catch (error) {
        // 参数解析失败：返回参数错误结果，不抛异常
        // 这样上层可以将错误信息正常反馈给模型，避免非法 JSON 回传导致 API 拒绝
        console.warn("[MCP] tool arguments parse failed", {
          tool: tool.name,
          arguments: call.function.arguments,
          error,
        });
        return {
          content: `参数解析失败: 工具 "${tool.name}" 的参数不是合法的 JSON 格式。\n错误: ${(error as Error).message}\n收到的参数: ${call.function.arguments}\n请提供合法的 JSON 格式参数。`,
          isParameterError: true,
        };
      }
    }

    console.debug("[MCP] execute tool", {
      tool: tool.name,
      source: tool.source,
      args: parsedArgs,
    });

    try {
      const result = await tool.executor(parsedArgs, {
        toolCallId: call.id,
        toolName: tool.name,
        source: tool.source,
        signal: options?.signal,
        conversationKey: options?.conversationKey,
        toolContext: options?.toolContext,
      });
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
          typeof result.content === "string" ? result.content : safeStringify(result.content),
        modelContent: result.modelContent,
        reasoning: result.reasoning,
        metadata: result.metadata,
        isCancelled: result.isCancelled,
      };
    } catch (error) {
      // 工具执行失败，根据错误类型区分处理
      const errorMsg = (error as Error).message.toLowerCase();
      const isParameterError =
        errorMsg.includes("invalid") ||
        errorMsg.includes("missing") ||
        errorMsg.includes("required") ||
        errorMsg.includes("argument") ||
        errorMsg.includes("parameter");

      if (isParameterError) {
        // 参数相关错误：返回错误结果（不抛异常），让上层反馈给模型纠正
        console.warn("[MCP] tool parameter error", {
          tool: tool.name,
          error,
        });
        return {
          content: `工具 "${tool.name}" 参数错误: ${(error as Error).message}\n请检查并修正参数后重新调用。`,
          isParameterError: true,
        };
      } else {
        // 执行错误（网络、超时等瞬时故障）：抛出异常，让上层决定是否自动重试
        console.error("[MCP] tool execution error", {
          tool: tool.name,
          error,
        });
        throw error;
      }
    }
  }
}

const registry = new ToolRegistry();

export default registry;
