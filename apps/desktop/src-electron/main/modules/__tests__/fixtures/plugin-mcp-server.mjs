import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "plugin-mcp-test", version: "1.0.0" },
  { capabilities: { tools: {} } }
);
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "echo",
      description: "返回输入与进程身份",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
    },
  ],
}));
server.setRequestHandler(CallToolRequestSchema, async request => ({
  content: [
    {
      type: "text",
      text: JSON.stringify({ text: request.params.arguments?.text, pid: process.pid }),
    },
  ],
}));
await server.connect(new StdioServerTransport());
