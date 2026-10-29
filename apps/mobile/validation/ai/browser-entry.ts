import { createValidationAgent, createValidationTools, type ValidationApi } from "./runtime";
import { encodeTurn, cardTurns, memoryCommands } from "./fixtures";

export { encodeTurn, cardTurns };

export async function run(baseUrl: string, api: ValidationApi) {
  const globals = globalThis as unknown as Record<string, unknown>;
  for (const name of ["process", "Buffer", "require"])
    if (globals[name] !== undefined) throw new Error(`浏览器验证环境不应提供 ${name}`);
  const host = memoryCommands();
  const agent = createValidationAgent({
    api,
    baseUrl,
    fetch: globalThis.fetch,
    tools: createValidationTools(host.commands),
  });
  const events: string[] = [];
  agent.subscribe(event => {
    events.push(event.type);
  });
  await agent.prompt("查找会议卡片并追加行动项");
  return {
    error: agent.state.errorMessage,
    busy: agent.state.isStreaming,
    pending: agent.state.pendingToolCalls.size,
    writes: host.writes,
    messages: agent.state.messages,
    events,
  };
}
