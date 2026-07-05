import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { Codex } from "@openai/codex-sdk";
import { Server as McpProtocolServer } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Express from "express";

const annotationMode = process.env.CODEX_MCP_SMOKE_ANNOTATIONS || "tau";
const toolName = process.env.CODEX_MCP_SMOKE_TOOL || "tau_echo";
const expectedText = process.env.CODEX_MCP_SMOKE_TEXT || "ping-from-smoke-test";
const timeoutMs = Number(process.env.CODEX_MCP_SMOKE_TIMEOUT_MS || 180_000);

const getToolAnnotations = () => {
  if (annotationMode === "none") {
    return undefined;
  }
  if (annotationMode === "minimal") {
    return {
      destructiveHint: false,
    };
  }
  return {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
};

const getTextPreview = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").slice(0, 160);
};

const summarizeEvent = (event) => {
  const item = event?.item;
  const text =
    item?.text ??
    item?.aggregated_output ??
    item?.output ??
    item?.message ??
    event?.message ??
    event?.error?.message;
  return {
    type: event?.type,
    itemType: item?.type,
    itemStatus: item?.status,
    itemId: item?.id,
    preview: getTextPreview(text),
  };
};

const createMcpServer = () => {
  let callCount = 0;
  const callLog = [];
  const protocolServer = new McpProtocolServer(
    {
      name: "tau-notes-smoke",
      version: "0.0.0-smoke",
    },
    {
      capabilities: {
        tools: {
          listChanged: true,
        },
      },
    },
  );

  protocolServer.setRequestHandler(ListToolsRequestSchema, async () => {
    const annotations = getToolAnnotations();
    const tool = {
      name: toolName,
      description:
        "Echo a text value. This smoke-test tool proves Codex can call Tau MCP tools without user approval.",
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "Text to echo.",
          },
        },
        required: ["text"],
        additionalProperties: false,
      },
      ...(annotations ? { annotations } : {}),
    };

    console.info("[smoke:mcp] tools/list", {
      annotationMode,
      annotations: tool.annotations ?? null,
      toolName,
    });
    return { tools: [tool] };
  });

  protocolServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    callCount += 1;
    const call = {
      id: randomUUID(),
      name: request.params.name,
      arguments: request.params.arguments ?? {},
    };
    callLog.push(call);
    console.info("[smoke:mcp] tools/call", call);

    if (request.params.name !== toolName) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Unexpected tool: ${request.params.name}`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `tau_echo_result:${String(request.params.arguments?.text ?? "")}`,
        },
      ],
      structuredContent: {
        ok: true,
        received: request.params.arguments ?? {},
      },
    };
  });

  return {
    protocolServer,
    getResult: () => ({
      callCount,
      callLog,
    }),
  };
};

const startMcpHttpServer = async () => {
  const { protocolServer, getResult } = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  transport.onerror = (error) => {
    console.error("[smoke:mcp] transport error", error);
  };
  await protocolServer.connect(transport);

  const app = Express();
  app.use(Express.json({ limit: "10mb" }));
  app.all("/mcp", async (req, res) => {
    const requestMethod = Array.isArray(req.body)
      ? req.body.map((item) => item?.method).filter(Boolean)
      : req.body?.method;
    console.info("[smoke:http] request", {
      httpMethod: req.method,
      method: requestMethod,
      sessionId: req.headers["mcp-session-id"] ?? null,
      protocolVersion: req.headers["mcp-protocol-version"] ?? null,
    });

    try {
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("[smoke:http] request failed", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message:
              error instanceof Error ? error.message : "MCP smoke test failed",
          },
          id: null,
        });
      }
    }
  });

  const httpServer = createServer(app);
  await new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", resolve);
  });

  const address = httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to allocate MCP smoke-test port");
  }

  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    getResult,
    close: async () => {
      await new Promise((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
      await transport.close?.();
      await protocolServer.close?.();
    },
  };
};

const runSmokeTest = async () => {
  const mcpServer = await startMcpHttpServer();
  const timeoutController = new AbortController();
  const workingDirectory = await mkdtemp(join(tmpdir(), "tau-codex-mcp-smoke-"));
  const timeout = setTimeout(() => {
    timeoutController.abort(new Error(`Timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  const completedEvents = [];
  const failedEvents = [];

  console.info("[smoke] started", {
    mcpUrl: mcpServer.url,
    annotationMode,
    expectedText,
  });

  try {
    const codex = new Codex({
      config: {
        mcp_servers: {
          tau_notes: {
            url: mcpServer.url,
          },
        },
      },
    });
    const thread = codex.startThread({
      workingDirectory,
      skipGitRepoCheck: true,
      sandboxMode: "read-only",
      approvalPolicy: "never",
      webSearchMode: "disabled",
    });
    const input = [
      {
        type: "text",
        text: [
          `Use the MCP server tau_notes and call the tool ${toolName}.`,
          `Pass {"text":"${expectedText}"} as the arguments.`,
          "Do not use shell commands. Do not answer from memory.",
          "After the tool result returns, reply with only the tool result text.",
        ].join("\n"),
      },
    ];
    const { events } = await thread.runStreamed(input, {
      signal: timeoutController.signal,
    });

    for await (const event of events) {
      console.info("[smoke:codex-event]", summarizeEvent(event));
      if (event?.type === "item.completed") {
        completedEvents.push(event);
      }
      if (event?.type === "turn.failed" || event?.type === "error") {
        failedEvents.push(event);
      }
    }
  } finally {
    clearTimeout(timeout);
    await rm(workingDirectory, { recursive: true, force: true });
    await mcpServer.close();
  }

  const result = mcpServer.getResult();
  const mcpItems = completedEvents
    .map((event) => event.item)
    .filter((item) => item?.type === "mcp_tool_call");
  const cancelledItems = mcpItems.filter(
    (item) =>
      item?.status === "cancelled" ||
      /cancelled|canceled|user cancelled/i.test(
        `${item?.error?.message ?? ""} ${item?.aggregated_output ?? ""}`,
      ),
  );

  console.info("[smoke] result", {
    toolCallCount: result.callCount,
    mcpItemCount: mcpItems.length,
    cancelledItemCount: cancelledItems.length,
    failedEventCount: failedEvents.length,
    callLog: result.callLog,
  });

  if (failedEvents.length > 0) {
    throw new Error("Codex turn failed; see [smoke:codex-event] logs above.");
  }
  if (cancelledItems.length > 0) {
    throw new Error("Codex reported a cancelled MCP tool call.");
  }
  if (result.callCount === 0) {
    throw new Error("Codex did not call the smoke-test MCP tool.");
  }
  if (result.callLog[0]?.arguments?.text !== expectedText) {
    throw new Error(
      `Unexpected tool arguments: ${JSON.stringify(result.callLog[0]?.arguments)}`,
    );
  }
};

runSmokeTest().catch((error) => {
  console.error("[smoke] failed", error);
  process.exitCode = 1;
});
