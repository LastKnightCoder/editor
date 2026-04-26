import type {
  AgentTool,
  AgentToolCall,
  AgentToolExecutionResult,
} from "@tau/agent";

import type { ToolCallPayload, ToolExecutionMetadata } from "@/types";

export const toExternalAgentTools = (
  tools: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>,
  executeToolCall: (
    call: ToolCallPayload,
    options?: {
      signal?: AbortSignal;
      conversationKey?: string;
      toolContext?: ToolExecutionMetadata;
    },
  ) => Promise<AgentToolExecutionResult | null>,
): AgentTool[] =>
  tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    source: "external",
    parameters: tool.function.parameters as AgentTool["parameters"],
    execute: async (args, context) => {
      const payload: AgentToolCall = {
        id: context?.toolCallId || `${tool.function.name}:external`,
        function: {
          name: tool.function.name,
          arguments: JSON.stringify(args),
        },
      };

      return executeToolCall(payload, {
        signal: context?.signal,
        conversationKey: context?.conversationKey,
        toolContext: context?.toolContext as ToolExecutionMetadata | undefined,
      });
    },
  }));
