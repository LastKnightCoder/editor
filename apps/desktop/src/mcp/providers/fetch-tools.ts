import type { ToolParameterSchema } from "@/types";
import { nodeFetch } from "@/commands/extra";
import type { MCPProviderDefinition } from "./types";

// axios response 类型
interface AxiosResponse {
  data: unknown;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

// 将响应数据转换为字符串
const stringifyData = (data: unknown): string => {
  if (typeof data === "string") {
    return data;
  }
  return JSON.stringify(data, null, 2);
};

export const fetchToolsProvider: MCPProviderDefinition = {
  id: "fetch-tools",
  name: "网络请求工具",
  description: "提供 HTTP 网络请求工具，使用 Node.js fetch 避免跨域限制",
  defaultEnabled: true,
  tools: () => [
    {
      name: "http_fetch",
      description:
        "发送 HTTP 请求。使用 Node.js 发送请求，可以绕过浏览器跨域限制。支持 GET、POST、PUT、DELETE、PATCH 等方法。返回响应状态、响应头和响应体。",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "请求的 URL 地址，必须是完整的 URL（包含协议）",
          },
          method: {
            type: "string",
            enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
            description: "HTTP 请求方法，默认为 GET",
          },
          headers: {
            type: "object",
            description:
              "请求头对象，例如：{ 'Content-Type': 'application/json', 'Authorization': 'Bearer token' }",
            additionalProperties: true,
          },
          body: {
            type: "string",
            description:
              "请求体内容。对于 JSON 数据，请先将对象转换为 JSON 字符串",
          },
          timeout: {
            type: "number",
            description: "请求超时时间（毫秒），默认为 30000（30秒）",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["url"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const url = args.url as string;
        const method = (args.method as string) || "GET";
        const headers = (args.headers as Record<string, string>) || {};
        const body = args.body as string | undefined;
        const timeout = (args.timeout as number) || 30000;

        // 验证 URL 格式
        try {
          new URL(url);
        } catch {
          return {
            content: JSON.stringify(
              {
                success: false,
                error:
                  "无效的 URL 格式，请提供完整的 URL（包含 http:// 或 https://）",
              },
              null,
              2,
            ),
          };
        }

        try {
          const options: Record<string, unknown> = {
            method,
            headers,
            timeout,
            isRaw: true, // 获取完整的 axios response
          };

          // 只有非 GET/HEAD 请求才添加 body
          if (body && !["GET", "HEAD"].includes(method)) {
            options.data = body;
          }

          const response = (await nodeFetch(url, options)) as AxiosResponse;

          return {
            content: JSON.stringify(
              {
                success: true,
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                body: stringifyData(response.data),
              },
              null,
              2,
            ),
          };
        } catch (error) {
          return {
            content: JSON.stringify(
              {
                success: false,
                error: `请求失败: ${(error as Error).message}`,
              },
              null,
              2,
            ),
          };
        }
      },
    },
    {
      name: "http_get",
      description:
        "发送 GET 请求的快捷方法。使用 Node.js 发送请求，可以绕过浏览器跨域限制。",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "请求的 URL 地址，必须是完整的 URL（包含协议）",
          },
          headers: {
            type: "object",
            description: "请求头对象",
            additionalProperties: true,
          },
        } as Record<string, ToolParameterSchema>,
        required: ["url"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const url = args.url as string;
        const headers = (args.headers as Record<string, string>) || {};

        try {
          new URL(url);
        } catch {
          return {
            content: JSON.stringify(
              {
                success: false,
                error: "无效的 URL 格式",
              },
              null,
              2,
            ),
          };
        }

        try {
          const response = (await nodeFetch(url, {
            method: "GET",
            headers,
            isRaw: true,
          })) as AxiosResponse;

          return {
            content: JSON.stringify(
              {
                success: true,
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                body: stringifyData(response.data),
              },
              null,
              2,
            ),
          };
        } catch (error) {
          return {
            content: JSON.stringify(
              {
                success: false,
                error: `请求失败: ${(error as Error).message}`,
              },
              null,
              2,
            ),
          };
        }
      },
    },
    {
      name: "http_post_json",
      description:
        "发送 POST JSON 请求的快捷方法。自动设置 Content-Type 为 application/json。使用 Node.js 发送请求，可以绕过浏览器跨域限制。",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "请求的 URL 地址，必须是完整的 URL（包含协议）",
          },
          data: {
            type: "object",
            description: "要发送的 JSON 数据对象，会自动序列化为 JSON 字符串",
            additionalProperties: true,
          },
          headers: {
            type: "object",
            description: "额外的请求头对象（Content-Type 会自动设置）",
            additionalProperties: true,
          },
        } as Record<string, ToolParameterSchema>,
        required: ["url", "data"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const url = args.url as string;
        const data = args.data as Record<string, unknown>;
        const extraHeaders = (args.headers as Record<string, string>) || {};

        try {
          new URL(url);
        } catch {
          return {
            content: JSON.stringify(
              {
                success: false,
                error: "无效的 URL 格式",
              },
              null,
              2,
            ),
          };
        }

        try {
          const headers = {
            "Content-Type": "application/json",
            ...extraHeaders,
          };

          const response = (await nodeFetch(url, {
            method: "POST",
            headers,
            data: JSON.stringify(data),
            isRaw: true,
          })) as AxiosResponse;

          return {
            content: JSON.stringify(
              {
                success: true,
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                body: response.data,
              },
              null,
              2,
            ),
          };
        } catch (error) {
          return {
            content: JSON.stringify(
              {
                success: false,
                error: `请求失败: ${(error as Error).message}`,
              },
              null,
              2,
            ),
          };
        }
      },
    },
  ],
};
