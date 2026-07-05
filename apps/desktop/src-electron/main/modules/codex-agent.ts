import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app, ipcMain, type IpcMainEvent, type WebContents } from "electron";
import Express from "express";
import type { ThreadEvent, ThreadOptions } from "@openai/codex-sdk";
import { Server as McpProtocolServer } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

import {
  createCodexCliEnvironment,
  resolveCodexCliPath,
} from "./codex-agent-cli";
import { getTauToolAnnotations } from "./codex-agent-mcp-annotations";

type CodexInput =
  | string
  | Array<
      | {
          type: "text";
          text: string;
        }
      | {
          type: "local_image";
          path: string;
        }
    >;

interface CodexToolDefinitionSnapshot {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface CodexStreamParams {
  input: CodexInput;
  agentSessionId?: string | null;
  workingDirectory?: string | null;
  mcpTools?: CodexToolDefinitionSnapshot[];
}

interface CodexBridgeToolExecutionResponse {
  requestId?: number;
  toolRequestId: string;
  ok: boolean;
  content?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

interface CodexBridgeToolExecutionRequest {
  requestId: number;
  toolRequestId: string;
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

const CODEX_EVENT_CHANNEL = "codex-agent:event";
const CODEX_MCP_REQUEST_CHANNEL = "codex-mcp-bridge:request";
const CODEX_MCP_RESPONSE_CHANNEL = "codex-mcp-bridge:response";

const summarizeToolNames = (tools: CodexToolDefinitionSnapshot[]) =>
  tools.slice(0, 50).map((tool) => tool.name);

const normalizeToolInputSchema = (
  parameters: Record<string, unknown>,
): Tool["inputSchema"] => {
  if (parameters.type === "object") {
    return parameters as Tool["inputSchema"];
  }

  return {
    type: "object",
    properties: {},
  };
};

const createTemporaryWorkingDirectory = async () =>
  mkdtemp(join(tmpdir(), "tau-codex-workspace-"));

const normalizeWorkingDirectory = (workingDirectory?: string | null) => {
  if (typeof workingDirectory !== "string") {
    return null;
  }
  const trimmed = workingDirectory.trim();
  return trimmed.length > 0 ? trimmed : null;
};

class CodexMcpBridge {
  private responseListener:
    | ((
        event: IpcMainEvent,
        response: CodexBridgeToolExecutionResponse,
      ) => void)
    | null = null;
  private server: Server | null = null;
  private mcpServer: McpProtocolServer | null = null;
  private mcpTransport: StreamableHTTPServerTransport | null = null;
  private url: string | null = null;
  private toolClient: WebContents | null = null;
  private tools: CodexToolDefinitionSnapshot[] = [];
  private pendingToolRequests = new Map<
    string,
    {
      resolve: (value: CodexBridgeToolExecutionResponse) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  constructor(private readonly requestId: number) {}

  init() {
    if (this.responseListener) {
      return;
    }

    this.responseListener = (
      event,
      response: CodexBridgeToolExecutionResponse,
    ) => {
      if (response.requestId !== this.requestId) {
        return;
      }
      if (this.toolClient && event.sender !== this.toolClient) {
        return;
      }

      const pending = this.pendingToolRequests.get(response.toolRequestId);
      if (!pending) {
        return;
      }
      clearTimeout(pending.timeout);
      this.pendingToolRequests.delete(response.toolRequestId);
      pending.resolve(response);
    };
    ipcMain.on(CODEX_MCP_RESPONSE_CHANNEL, this.responseListener);
  }

  async ensure(
    sender: WebContents,
    tools: CodexToolDefinitionSnapshot[] = [],
  ): Promise<string> {
    this.toolClient = sender;
    this.tools = tools;

    console.info("[Codex MCP] bridge tools snapshot", {
      toolCount: tools.length,
      toolNames: summarizeToolNames(tools),
      truncated: tools.length > 50,
      url: this.url,
    });

    if (this.url) {
      return this.url;
    }

    const appServer = Express();
    appServer.use(Express.json({ limit: "10mb" }));
    await this.ensureMcpTransport();

    appServer.all("/mcp", async (req, res) => {
      const requestMethod = Array.isArray(req.body)
        ? req.body.map((item) => item?.method).filter(Boolean)
        : req.body?.method;

      console.info("[Codex MCP] bridge received HTTP request", {
        httpMethod: req.method,
        method: requestMethod,
        sessionId: req.headers["mcp-session-id"] ?? null,
        protocolVersion: req.headers["mcp-protocol-version"] ?? null,
        toolCount: this.tools.length,
      });

      try {
        const transport = await this.ensureMcpTransport();
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error("[Codex MCP] request failed", error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message:
                error instanceof Error ? error.message : "MCP bridge failed",
            },
            id: null,
          });
        }
      }
    });

    this.server = createServer(appServer);
    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(0, "127.0.0.1", () => resolve());
    });

    const address = this.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Codex MCP bridge 端口分配失败");
    }

    this.url = `http://127.0.0.1:${address.port}/mcp`;
    console.info("[Codex MCP] bridge listening", {
      url: this.url,
      toolCount: this.tools.length,
    });
    return this.url;
  }

  private async ensureMcpTransport() {
    if (this.mcpTransport) {
      return this.mcpTransport;
    }

    this.mcpServer = this.createMcpServer();
    this.mcpTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    this.mcpTransport.onerror = (error) => {
      console.error("[Codex MCP] transport error", error);
    };
    await this.mcpServer.connect(this.mcpTransport);
    return this.mcpTransport;
  }

  private createMcpServer() {
    const server = new McpProtocolServer(
      {
        name: "tau-notes",
        version: app.getVersion(),
      },
      {
        capabilities: {
          tools: {
            listChanged: true,
          },
        },
      },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = this.tools.map<Tool>((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: normalizeToolInputSchema(tool.parameters),
        annotations: getTauToolAnnotations(),
      }));

      console.info("[Codex MCP] bridge tools/list", {
        toolCount: tools.length,
        toolNames: tools.slice(0, 50).map((tool) => tool.name),
        truncated: tools.length > 50,
      });

      return { tools };
    });

    server.setRequestHandler(
      CallToolRequestSchema,
      async (request): Promise<CallToolResult> => {
        const toolName = request.params.name;
        const tool = this.tools.find(
          (candidate) => candidate.name === toolName,
        );

        console.info("[Codex MCP] bridge tools/call", {
          toolName,
          found: Boolean(tool),
          argumentKeys: Object.keys(request.params.arguments ?? {}),
        });

        if (!tool) {
          return {
            content: [
              {
                type: "text",
                text: `未找到名为 ${toolName} 的工具`,
              },
            ],
            isError: true,
          };
        }

        const response = await this.executeTool(
          tool.name,
          request.params.arguments ?? {},
        );

        console.info("[Codex MCP] bridge tools/call completed", {
          toolName,
          ok: response.ok,
          hasContent: Boolean(response.content),
          hasMetadata: Boolean(response.metadata),
        });

        return {
          content: [
            {
              type: "text",
              text: response.ok
                ? response.content || "工具执行成功，但未返回结果"
                : response.error || "工具执行失败",
            },
          ],
          structuredContent: response.metadata,
          isError: !response.ok,
        };
      },
    );

    return server;
  }

  private executeTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<CodexBridgeToolExecutionResponse> {
    const client = this.toolClient;
    if (!client || client.isDestroyed()) {
      return Promise.resolve({
        requestId: this.requestId,
        toolRequestId: "",
        ok: false,
        error: "笔记软件工具中心暂不可用",
      });
    }

    const toolRequestId = randomUUID();
    const payload: CodexBridgeToolExecutionRequest = {
      requestId: this.requestId,
      toolRequestId,
      toolCallId: randomUUID(),
      toolName,
      arguments: args,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingToolRequests.delete(toolRequestId);
        reject(new Error(`工具 ${toolName} 执行超时`));
      }, 120_000);

      this.pendingToolRequests.set(toolRequestId, {
        resolve,
        reject,
        timeout,
      });

      client.send(CODEX_MCP_REQUEST_CHANNEL, payload);
    });
  }

  async close() {
    if (this.responseListener) {
      ipcMain.off(CODEX_MCP_RESPONSE_CHANNEL, this.responseListener);
      this.responseListener = null;
    }

    for (const [requestId, pending] of this.pendingToolRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Codex MCP bridge 已关闭"));
      this.pendingToolRequests.delete(requestId);
    }

    await this.mcpTransport?.close?.();
    await this.mcpServer?.close?.();
    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server?.close((error) => (error ? reject(error) : resolve()));
      });
    }

    this.server = null;
    this.mcpServer = null;
    this.mcpTransport = null;
    this.url = null;
    this.toolClient = null;
    this.tools = [];
  }
}

export default class CodexAgent extends EventEmitter {
  private static requestCounter = 0;
  private static senders = new Map<number, WebContents>();
  private static activeTurns = new Map<number, AbortController>();

  public static init() {
    ipcMain.handle("codex-agent:getAvailability", async () => {
      try {
        resolveCodexCliPath();
        await import("@openai/codex-sdk");
        return { available: true, reason: null };
      } catch (error) {
        return {
          available: false,
          reason: error instanceof Error ? error.message : "Codex SDK 不可用",
        };
      }
    });

    ipcMain.handle(
      "codex-agent:stream",
      async (event, params: CodexStreamParams) => {
        const requestId = ++CodexAgent.requestCounter;
        CodexAgent.senders.set(requestId, event.sender);
        void CodexAgent.runStream(requestId, event.sender, params);
        return { requestId };
      },
    );

    ipcMain.handle(
      "codex-agent:cancel",
      async (_event, { requestId }: { requestId: number }) => {
        const controller = CodexAgent.activeTurns.get(requestId);
        controller?.abort();
        CodexAgent.activeTurns.delete(requestId);
        CodexAgent.senders.delete(requestId);
      },
    );
  }

  private static async runStream(
    requestId: number,
    sender: WebContents,
    params: CodexStreamParams,
  ) {
    const abortController = new AbortController();
    const mcpBridge = new CodexMcpBridge(requestId);
    mcpBridge.init();
    CodexAgent.activeTurns.set(requestId, abortController);
    let temporaryWorkingDirectory: string | null = null;

    try {
      const selectedWorkingDirectory = normalizeWorkingDirectory(
        params.workingDirectory,
      );
      temporaryWorkingDirectory = selectedWorkingDirectory
        ? null
        : await createTemporaryWorkingDirectory();
      const workingDirectory =
        selectedWorkingDirectory ?? temporaryWorkingDirectory;
      if (!workingDirectory) {
        throw new Error("Codex 工作目录创建失败");
      }

      const mcpUrl = await mcpBridge.ensure(sender, params.mcpTools || []);
      const codexCliPath = resolveCodexCliPath();
      const codexEnv = createCodexCliEnvironment();
      const { Codex } = await import("@openai/codex-sdk");
      const codex = new Codex({
        codexPathOverride: codexCliPath,
        env: codexEnv,
        config: {
          mcp_servers: {
            tau_notes: {
              url: mcpUrl,
            },
          },
        },
      });
      const threadOptions: ThreadOptions = {
        workingDirectory,
        skipGitRepoCheck: true,
        sandboxMode: "read-only",
        approvalPolicy: "never",
        webSearchMode: "live",
      };
      const thread = params.agentSessionId
        ? codex.resumeThread(params.agentSessionId, threadOptions)
        : codex.startThread(threadOptions);
      const { events } = await thread.runStreamed(params.input, {
        signal: abortController.signal,
      });

      for await (const event of events) {
        CodexAgent.sendEvent(requestId, event);
      }

      CodexAgent.sendEvent(requestId, { type: "done" });
    } catch (error) {
      CodexAgent.sendEvent(requestId, {
        type: "error",
        message: error instanceof Error ? error.message : "Codex 请求失败",
      });
    } finally {
      try {
        await mcpBridge.close();
      } catch (error) {
        console.error("[Codex MCP] bridge close failed", error);
      } finally {
        if (temporaryWorkingDirectory) {
          await rm(temporaryWorkingDirectory, { recursive: true, force: true });
        }
        CodexAgent.activeTurns.delete(requestId);
        CodexAgent.senders.delete(requestId);
      }
    }
  }

  private static sendEvent(requestId: number, event: ThreadEvent | any) {
    const sender = CodexAgent.senders.get(requestId);
    if (!sender || sender.isDestroyed()) {
      return;
    }
    sender.send(CODEX_EVENT_CHANNEL, {
      requestId,
      event,
    });
  }
}
