import { describe, expect, it, vi } from "vitest";

import {
  Agent,
  type AgentEvent,
  type AgentMessage,
  type AgentModelAdapter,
  type AgentTool,
} from "../index";

const userMessage = (text: string): AgentMessage => ({
  role: "user",
  content: [{ type: "text", text }],
});

const collect = async (events: AsyncIterable<AgentEvent>) => {
  const result: AgentEvent[] = [];
  for await (const event of events) result.push(event);
  return result;
};

/** 第一轮调一次 run_script，第二轮回复 done；记录每轮看到的消息 */
const createToolCallingModel = (seen: AgentMessage[][]): AgentModelAdapter => {
  let turn = 0;
  return {
    async *streamTurn(request) {
      seen.push(request.messages);
      if (turn++ === 0) {
        const toolCalls = [{ id: "call_1", function: { name: "run_script", arguments: "{}" } }];
        yield {
          type: "turn-complete",
          result: {
            type: "tool_calls",
            content: "",
            reasoningContent: "",
            finishReason: "tool_calls",
            toolCalls,
          },
        };
        return;
      }
      yield {
        type: "turn-complete",
        result: { type: "response", content: "done", reasoningContent: "", finishReason: "stop" },
      };
    },
  };
};

const createTool = (execute: AgentTool["execute"]): AgentTool => ({
  name: "run_script",
  description: "run",
  source: "test",
  risk: "execute",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  execute,
});

describe("Agent 工具授权", () => {
  it("需要授权时先进入 awaiting-approval，批准后照常执行", async () => {
    const execute = vi.fn(async () => ({ content: "ok" }));
    const authorizeToolCall = vi.fn(async (_request: { tool?: AgentTool }) => ({
      approved: true as const,
    }));
    const agent = new Agent({
      model: createToolCallingModel([]),
      tools: [createTool(execute)],
      policies: {
        shouldAuthorizeToolCall: ({ tool }) => tool?.risk === "execute",
        authorizeToolCall,
      },
    });

    const events = await collect(agent.run({ messages: [userMessage("hi")], enableTools: true }));
    const statuses = events
      .filter(e => e.type === "tool-call-updated" || e.type === "tool-call-finished")
      .map(e => (e as Extract<AgentEvent, { type: "tool-call-finished" }>).execution.status);

    expect(statuses[0]).toBe("awaiting-approval");
    expect(statuses[statuses.length - 1]).toBe("success");
    expect(authorizeToolCall).toHaveBeenCalledTimes(1);
    expect(authorizeToolCall.mock.calls[0]?.[0].tool?.name).toBe("run_script");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("拒绝时不执行工具，回填拒绝结果并继续下一轮", async () => {
    const seen: AgentMessage[][] = [];
    const execute = vi.fn(async () => ({ content: "ok" }));
    const agent = new Agent({
      model: createToolCallingModel(seen),
      tools: [createTool(execute)],
      policies: {
        shouldAuthorizeToolCall: () => true,
        authorizeToolCall: async () => ({ approved: false, reason: "太危险" }),
      },
    });

    const events = await collect(agent.run({ messages: [userMessage("hi")], enableTools: true }));
    const finished = events.find(
      (e): e is Extract<AgentEvent, { type: "tool-call-finished" }> =>
        e.type === "tool-call-finished"
    );

    expect(execute).not.toHaveBeenCalled();
    expect(finished?.execution.status).toBe("cancelled");
    expect(finished?.execution.metadata?.denied).toBe(true);
    const toolResult = seen[1]?.find(m => m.role === "tool");
    expect(JSON.stringify(toolResult?.content)).toContain("太危险");
    expect(events[events.length - 1]?.type).toBe("run-finished");
  });

  it("shouldAuthorizeToolCall 返回 false 时不打断执行", async () => {
    const authorizeToolCall = vi.fn(async () => ({ approved: false as const }));
    const agent = new Agent({
      model: createToolCallingModel([]),
      tools: [createTool(async () => "ok")],
      policies: { shouldAuthorizeToolCall: () => false, authorizeToolCall },
    });
    const events = await collect(agent.run({ messages: [userMessage("hi")], enableTools: true }));
    expect(authorizeToolCall).not.toHaveBeenCalled();
    expect(events.some(e => e.type === "tool-call-updated")).toBe(false);
  });
});

describe("点名 Skill 注入", () => {
  it("metadata.forcedSkillIds 里的 Skill 注入全文，其余仍只列描述", async () => {
    const seen: AgentMessage[][] = [];
    const model: AgentModelAdapter = {
      async *streamTurn(request) {
        seen.push(request.messages);
        yield {
          type: "turn-complete",
          result: { type: "response", content: "done", reasoningContent: "", finishReason: "stop" },
        };
      },
    };
    const loadReadme = vi.fn(async () => "# 周报\n先查日记");
    const agent = new Agent({
      model,
      skills: [
        { folderName: "weekly", name: "周报整理", description: "整理周报", loadReadme },
        { folderName: "mindmap", name: "思维导图", description: "画导图", readmeContent: "# 导图" },
      ],
    });

    await collect(
      agent.run({ messages: [userMessage("$周报整理")], metadata: { forcedSkillIds: ["weekly"] } })
    );

    const text = (seen[0][0].content as Array<{ text: string }>)[0].text;
    expect(loadReadme).toHaveBeenCalledTimes(1);
    expect(text).toContain("## 本轮指定的 Skills");
    expect(text).toContain("先查日记");
    expect(text).toContain("mindmap metadata");
    expect(text).not.toContain("weekly metadata");
  });
});
