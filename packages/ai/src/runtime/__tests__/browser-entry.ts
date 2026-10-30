import { AiRuntime } from "../runtime";
import { AiToolRegistry } from "../../tools";
import { AiSkillRegistry, createSkillTools, formatSkillCatalog } from "../../skills";
import { AiMcpManager } from "../../mcp";
import { memoryStore, request, model, encodeTurn } from "./fixtures";

export * as models from "../../models";
export * as catalog from "../../catalog";
export { AiRuntime, AiToolRegistry, AiSkillRegistry, AiMcpManager, encodeTurn };
export const turns = [
  { tool: "load_skill", args: { id: "builtin:summary" } },
  { tool: "mcp_validation__read_card", args: { id: 7 } },
  { text: "已根据技能读取卡片。" },
];

export async function run(baseUrl: string) {
  const globals = globalThis as unknown as Record<string, unknown>;
  for (const name of ["process", "Buffer", "require"])
    if (globals[name] !== undefined) throw new Error(`浏览器不应提供 ${name}`);
  const tools = new AiToolRegistry();
  const skills = new AiSkillRegistry();
  skills.registerSource({
    id: "builtin",
    revision: "1",
    async list() {
      return [{ id: "summary", path: "summary/SKILL.md" }];
    },
    async read() {
      return "---\nname: card-summary\ndescription: 整理卡片\n---\n先读取卡片，再总结其内容。";
    },
  });
  const skillSnapshot = await skills.captureAvailable();
  for (const tool of createSkillTools(skillSnapshot)) tools.register(tool.spec, tool.execute);
  const mcp = new AiMcpManager(tools, { fetch, timeoutMs: 2000 });
  const store = memoryStore();
  const runtime = new AiRuntime({
    store: store.store,
    tools,
    resolveModel: async () => ({
      model: { ...model, baseUrl: `${baseUrl}/v1` },
      fetch,
      dispose: async () => undefined,
    }),
    permissionMode: () => "bypass",
    preparePrompt: async () => formatSkillCatalog(skillSnapshot.skills),
  });
  try {
    const connection = await mcp.connect({
      id: "validation",
      name: "验证 MCP",
      transport: { type: "streamable-http", url: `${baseUrl}/mcp` },
    });
    const input = request(store.read().revision, { toolIds: tools.list().map(tool => tool.id) });
    const result = await (await runtime.start(input)).result;
    return {
      outcome: result.outcome,
      error: result.error,
      messages: result.messages,
      entries: store.read().document.entries.length,
      mcpToolIds: connection.toolIds,
      busy: runtime.getSnapshot(input.runId)?.status !== "settled",
    };
  } finally {
    await runtime.dispose();
    await mcp.dispose();
  }
}
