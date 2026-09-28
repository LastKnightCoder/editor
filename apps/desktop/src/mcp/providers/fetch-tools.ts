import type { ToolParameterSchema } from "@/types";
import { nodeFetch } from "@/commands/extra";
import type { MCPProviderDefinition } from "./types";

interface AxiosResponse {
  data: unknown;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

export const fetchToolsProvider: MCPProviderDefinition = {
  id: "fetch-tools",
  name: "网络请求工具",
  description: "提供通用 HTTP 网络请求工具。",
  defaultEnabled: true,
  tools: () => [
    {
      name: "http_fetch",
      risk: "execute",
      description:
        "发送 HTTP 请求并返回状态、响应头和响应体。支持 GET、POST、PUT、DELETE、PATCH、HEAD 和 OPTIONS。",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "完整的 HTTP 或 HTTPS URL" },
          method: {
            type: "string",
            enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
          },
          headers: { type: "object", additionalProperties: true },
          body: { type: "string", description: "请求体字符串" },
          timeout: { type: "number", description: "超时时间（毫秒），默认 30000" },
        } as Record<string, ToolParameterSchema>,
        required: ["url"],
        additionalProperties: false,
      },
      executor: async args => {
        const url = args.url as string;
        try {
          new URL(url);
        } catch {
          return { content: JSON.stringify({ success: false, error: "无效的 URL 格式" }) };
        }
        try {
          const method = (args.method as string | undefined) ?? "GET";
          const options: Record<string, unknown> = {
            method,
            headers: (args.headers as Record<string, string> | undefined) ?? {},
            timeout: (args.timeout as number | undefined) ?? 30000,
            isRaw: true,
          };
          if (args.body && !["GET", "HEAD"].includes(method)) options.data = args.body;
          const response = (await nodeFetch(url, options)) as AxiosResponse;
          return {
            content: JSON.stringify(
              {
                success: true,
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                body:
                  typeof response.data === "string"
                    ? response.data
                    : JSON.stringify(response.data, null, 2),
              },
              null,
              2
            ),
          };
        } catch (error) {
          return {
            content: JSON.stringify(
              { success: false, error: `请求失败: ${(error as Error).message}` },
              null,
              2
            ),
          };
        }
      },
    },
  ],
};
