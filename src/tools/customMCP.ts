import { invoke } from "@/electron";
import type {
  ToolDefinition,
  ToolExecutionResult,
  ToolJsonSchema,
} from "@/types";
import type { CustomMCPServer } from "@/stores/useMCPStore";

interface RemoteToolDefinition {
  name: string;
  description: string;
  parameters: ToolJsonSchema;
}

const fetchRemoteDefinitions = async (
  server: CustomMCPServer,
): Promise<RemoteToolDefinition[]> => {
  const response = (await invoke("mcp-fetch-tools", {
    baseUrl: server.baseUrl,
    apiKey: server.apiKey,
  })) as RemoteToolDefinition[];
  console.debug("[MCP] loaded tools", {
    server: server.name,
    count: response.length,
    toolNames: response.map((tool) => tool.name),
  });
  return response;
};

const invokeRemoteTool = async (
  server: CustomMCPServer,
  toolName: string,
  args?: Record<string, unknown>,
): Promise<string> => {
  return (await invoke("mcp-invoke-tool", {
    baseUrl: server.baseUrl,
    apiKey: server.apiKey,
    toolName,
    args,
  })) as string;
};
export const fetchToolsFromServer = async (
  server: CustomMCPServer,
): Promise<ToolDefinition[]> => {
  const remoteTools = await fetchRemoteDefinitions(server);

  return remoteTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    executor: async (args) => {
      console.debug("[MCP] invoke tool", {
        server: server.name,
        tool: tool.name,
        args,
      });
      const invokeRaw = await invokeRemoteTool(server, tool.name, args ?? {});
      let parsedResult: ToolExecutionResult | string | Record<string, unknown>;
      try {
        parsedResult = JSON.parse(invokeRaw) as
          | ToolExecutionResult
          | string
          | Record<string, unknown>;
      } catch (error) {
        console.error("[MCP] parse tool invocation error", {
          server: server.name,
          tool: tool.name,
          rawBody: invokeRaw,
          error,
        });
        throw new Error(
          `解析工具 ${tool.name} 响应失败: ${(error as Error).message}`,
        );
      }

      if (typeof parsedResult === "string") {
        console.debug("[MCP] tool result (string)", {
          server: server.name,
          tool: tool.name,
          result: parsedResult,
        });
        return {
          content: parsedResult,
        };
      }

      if ("content" in parsedResult) {
        console.debug("[MCP] tool result (object)", {
          server: server.name,
          tool: tool.name,
          result: parsedResult,
        });
        return parsedResult as ToolExecutionResult;
      }

      console.debug("[MCP] tool result (json object)", {
        server: server.name,
        tool: tool.name,
        result: parsedResult,
      });
      return {
        content: JSON.stringify(parsedResult),
      };
    },
  }));
};
