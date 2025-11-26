import { ipcMain } from "electron";
import type { Module } from "../types/module";

interface MCPBasePayload {
  baseUrl: string;
  apiKey?: string;
}

interface MCPInvokePayload extends MCPBasePayload {
  toolName: string;
  args?: Record<string, unknown>;
}

const normalizeBaseUrl = (url: string) => url.replace(/\/+$/, "");

const buildHeaders = (apiKey?: string): Record<string, string> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
};

class MCPModule implements Module {
  name = "mcp";

  async init(): Promise<void> {
    ipcMain.handle(
      "mcp-fetch-tools",
      async (_event, payload: MCPBasePayload) => {
        return await this.fetchTools(payload);
      },
    );

    ipcMain.handle(
      "mcp-invoke-tool",
      async (_event, payload: MCPInvokePayload) => {
        return await this.invokeTool(payload);
      },
    );
  }

  private async fetchTools(payload: MCPBasePayload) {
    const baseUrl = normalizeBaseUrl(payload.baseUrl);
    const response = await fetch(`${baseUrl}/tools`, {
      method: "GET",
      headers: buildHeaders(payload.apiKey),
    });

    if (!response.ok) {
      throw new Error(
        `无法从 ${baseUrl} 获取工具列表: ${response.status} ${response.statusText}`,
      );
    }

    const raw = await response.text();
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new Error("工具列表响应不是数组");
      }
      return parsed;
    } catch (error) {
      throw new Error(
        `解析 ${baseUrl} 工具列表失败: ${(error as Error).message}`,
      );
    }
  }

  private async invokeTool(payload: MCPInvokePayload) {
    const baseUrl = normalizeBaseUrl(payload.baseUrl);
    const response = await fetch(
      `${baseUrl}/tools/${encodeURIComponent(payload.toolName)}/invoke`,
      {
        method: "POST",
        headers: buildHeaders(payload.apiKey),
        body: JSON.stringify({
          arguments: payload.args ?? {},
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `调用工具 ${payload.toolName} 失败: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`,
      );
    }

    return await response.text();
  }
}

export default new MCPModule();
