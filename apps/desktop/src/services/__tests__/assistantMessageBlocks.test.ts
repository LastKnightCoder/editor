import { afterEach, describe, expect, it, vi } from "vitest";

import { Role } from "@/constants";
import type { AssistantReasoningBlock } from "@/types";
import {
  applyAssistantReasoningSnapshot,
  applyAssistantProviderMetadataSnapshot,
  applyAssistantTextSnapshot,
  applyAssistantToolCallsSnapshot,
  buildAssistantHistoryMessages,
  createAssistantMessage,
  finalizeAssistantTurn,
  getAssistantContentBlocks,
} from "../assistantMessageBlocks";

const getReasoningBlock = (
  message: ReturnType<typeof createAssistantMessage>,
  turnId: string
): AssistantReasoningBlock | undefined =>
  message.assistant_blocks?.find(
    (block): block is AssistantReasoningBlock =>
      block.turnId === turnId && block.type === "reasoning"
  );

afterEach(() => {
  vi.useRealTimers();
});

describe("assistant message identity", () => {
  it("调用方未提供有效 clientId 时保留自动生成的消息标识", () => {
    expect(createAssistantMessage({ clientId: undefined }).clientId).toMatch(/^msg:/);
    expect(createAssistantMessage({ clientId: "" }).clientId).toMatch(/^msg:/);
    expect(createAssistantMessage({ clientId: "existing-id" }).clientId).toBe("existing-id");
  });
});

describe("assistant reasoning timing", () => {
  it("在首个正文增量到达时立即结束 reasoning 计时", () => {
    vi.useFakeTimers();
    const message = createAssistantMessage();
    const turnId = "turn-text";

    applyAssistantReasoningSnapshot(message, turnId, "先思考", 1000);

    vi.setSystemTime(2500);
    applyAssistantTextSnapshot(message, turnId, "开始回答");

    const reasoningBlock = getReasoningBlock(message, turnId);
    expect(reasoningBlock?.endTime).toBe(2500);
    expect(reasoningBlock?.duration).toBe(1500);

    vi.setSystemTime(4000);
    applyAssistantTextSnapshot(message, turnId, "开始回答，继续补充");

    expect(reasoningBlock?.endTime).toBe(2500);
    expect(reasoningBlock?.duration).toBe(1500);
    expect(message.content).toBe("开始回答，继续补充");
  });

  it("在首个工具调用增量到达时立即结束 reasoning 计时", () => {
    vi.useFakeTimers();
    const message = createAssistantMessage();
    const turnId = "turn-tool";

    applyAssistantReasoningSnapshot(message, turnId, "先思考", 1000);

    vi.setSystemTime(1800);
    applyAssistantToolCallsSnapshot(
      message,
      turnId,
      [
        {
          toolCallId: "call-1",
          toolName: "search_docs",
          status: "pending",
          input: '{"q":"reasoning"}',
          timestamp: 1800,
        },
      ],
      [
        {
          id: "call-1",
          type: "function",
          function: {
            name: "search_docs",
            arguments: '{"q":"reasoning"}',
          },
        },
      ]
    );

    const reasoningBlock = getReasoningBlock(message, turnId);
    expect(reasoningBlock?.endTime).toBe(1800);
    expect(reasoningBlock?.duration).toBe(800);
  });

  it("只有 reasoning 时，在 turn finalize 阶段补齐结束时间", () => {
    vi.useFakeTimers();
    const message = createAssistantMessage();
    const turnId = "turn-finalize";

    applyAssistantReasoningSnapshot(message, turnId, "先思考", 1000);

    vi.setSystemTime(1700);
    finalizeAssistantTurn(message, turnId);

    const reasoningBlock = getReasoningBlock(message, turnId);
    expect(reasoningBlock?.endTime).toBe(1700);
    expect(reasoningBlock?.duration).toBe(700);
  });

  it("已结束的 reasoning 不会被后续 text/tool 更新重复覆盖", () => {
    vi.useFakeTimers();
    const message = createAssistantMessage();
    const turnId = "turn-stable";

    applyAssistantReasoningSnapshot(message, turnId, "先思考", 1000);

    vi.setSystemTime(2000);
    applyAssistantTextSnapshot(message, turnId, "第一次回答");

    const reasoningBlock = getReasoningBlock(message, turnId);
    expect(reasoningBlock?.endTime).toBe(2000);
    expect(reasoningBlock?.duration).toBe(1000);

    vi.setSystemTime(3500);
    applyAssistantToolCallsSnapshot(
      message,
      turnId,
      [
        {
          toolCallId: "call-2",
          toolName: "search_docs",
          status: "executing",
          input: '{"q":"followup"}',
          timestamp: 3500,
        },
      ],
      [
        {
          id: "call-2",
          type: "function",
          function: {
            name: "search_docs",
            arguments: '{"q":"followup"}',
          },
        },
      ]
    );

    expect(reasoningBlock?.endTime).toBe(2000);
    expect(reasoningBlock?.duration).toBe(1000);
  });

  it("工具调用后的新一轮 turn 应能重新创建 reasoning 并保持内容块顺序", () => {
    vi.useFakeTimers();
    const message = createAssistantMessage();
    const toolTurnId = "turn-tool-call";
    const answerTurnId = "turn-answer";

    applyAssistantReasoningSnapshot(message, toolTurnId, "先思考", 1000);

    vi.setSystemTime(1500);
    applyAssistantToolCallsSnapshot(
      message,
      toolTurnId,
      [
        {
          toolCallId: "call-1",
          toolName: "search_docs",
          status: "success",
          input: '{"q":"tesla"}',
          output: "搜索完成",
          timestamp: 1500,
        },
      ],
      [
        {
          id: "call-1",
          type: "function",
          function: {
            name: "search_docs",
            arguments: '{"q":"tesla"}',
          },
        },
      ]
    );
    finalizeAssistantTurn(message, toolTurnId);

    vi.setSystemTime(2200);
    applyAssistantReasoningSnapshot(message, answerTurnId, "再思考", 2200);

    vi.setSystemTime(2600);
    applyAssistantTextSnapshot(message, answerTurnId, "最终答案");
    finalizeAssistantTurn(message, answerTurnId);

    expect(message.reasoning_content).toBe("先思考\n\n再思考");
    expect(message.content).toBe("最终答案");
    expect(getAssistantContentBlocks(message)).toEqual([
      {
        type: "reasoning",
        content: "先思考",
        startTime: 1000,
        endTime: 1500,
        duration: 500,
      },
      {
        type: "tool_calls",
        executions: [
          {
            toolCallId: "call-1",
            toolName: "search_docs",
            status: "success",
            input: '{"q":"tesla"}',
            output: "搜索完成",
            timestamp: 1500,
          },
        ],
      },
      {
        type: "reasoning",
        content: "再思考",
        startTime: 2200,
        endTime: 2600,
        duration: 400,
      },
      {
        type: "text",
        content: "最终答案",
      },
    ]);
  });

  it("重建 assistant tool 历史时保留 reasoning_content", () => {
    const message = createAssistantMessage();
    const turnId = "turn-tool-history";

    applyAssistantReasoningSnapshot(message, turnId, "先分析参数", 1000);
    applyAssistantToolCallsSnapshot(
      message,
      turnId,
      [
        {
          toolCallId: "call-1",
          toolName: "search_docs",
          status: "success",
          input: '{"q":"kimi"}',
          output: "搜索完成",
          timestamp: 1200,
        },
      ],
      [
        {
          id: "call-1",
          type: "function",
          function: {
            name: "search_docs",
            arguments: '{"q":"kimi"}',
          },
        },
      ]
    );
    finalizeAssistantTurn(message, turnId);

    expect(buildAssistantHistoryMessages(message)).toEqual([
      {
        role: Role.Assistant,
        content: "",
        reasoning_content: "先分析参数",
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            function: {
              name: "search_docs",
              arguments: '{"q":"kimi"}',
            },
          },
        ],
      },
      {
        role: Role.Tool,
        content: [{ type: "text", text: "搜索完成" }],
        tool_call_id: "call-1",
        name: "search_docs",
      },
    ]);
  });

  it("重建普通 assistant 历史时保留 reasoning_content", () => {
    const message = createAssistantMessage();
    const turnId = "turn-answer-history";

    applyAssistantReasoningSnapshot(message, turnId, "先整理思路", 1000);
    applyAssistantTextSnapshot(message, turnId, "最终答案");
    finalizeAssistantTurn(message, turnId);

    expect(buildAssistantHistoryMessages(message)).toEqual([
      {
        role: Role.Assistant,
        content: [{ type: "text", text: "最终答案" }],
        reasoning_content: "先整理思路",
      },
    ]);
  });

  it("重建 Claude assistant 历史时保留供应商原始思考块", () => {
    const message = createAssistantMessage();
    const turnId = "turn-claude-thinking";
    const providerMetadata = {
      claude: {
        content: [
          {
            type: "thinking",
            thinking: "先分析",
            signature: "signed-thinking",
          },
          { type: "text", text: "最终答案" },
        ],
      },
    };

    applyAssistantReasoningSnapshot(message, turnId, "先分析", 1000);
    applyAssistantTextSnapshot(message, turnId, "最终答案");
    applyAssistantProviderMetadataSnapshot(message, turnId, providerMetadata);
    finalizeAssistantTurn(message, turnId);

    expect(buildAssistantHistoryMessages(message)).toEqual([
      {
        role: Role.Assistant,
        content: [{ type: "text", text: "最终答案" }],
        reasoning_content: "先分析",
        provider_metadata: providerMetadata,
      },
    ]);
  });

  it("读取内容块时不应修改冻结的 assistant message", () => {
    const message = Object.freeze({
      role: Role.Assistant,
      content: "最终答案",
      reasoning_content: "先整理思路",
      tool_calls: undefined,
      assistant_blocks: [
        {
          id: "turn-1:reasoning",
          turnId: "turn-1",
          type: "reasoning" as const,
          state: "final" as const,
          content: "先整理思路",
        },
        {
          id: "turn-1:text",
          turnId: "turn-1",
          type: "text" as const,
          state: "final" as const,
          content: "最终答案",
        },
      ],
    });

    expect(() => getAssistantContentBlocks(message as never)).not.toThrow();
    expect(buildAssistantHistoryMessages(message as never)).toEqual([
      {
        role: Role.Assistant,
        content: [{ type: "text", text: "最终答案" }],
        reasoning_content: "先整理思路",
      },
    ]);
  });
});

describe("退役代理历史工具", () => {
  it("保留正文和工具结果为只读上下文，不产生工具调用或修改原记录", () => {
    const message = createAssistantMessage();
    applyAssistantTextSnapshot(message, "legacy:codex", "已读取文档");
    applyAssistantToolCallsSnapshot(message, "legacy:codex", [
      {
        toolCallId: "old-call",
        toolName: "tau_notes.read",
        status: "success",
        input: "{}",
        output: "历史文档正文",
        timestamp: 1,
        metadata: { codexItemType: "mcp_tool_call" },
      },
    ]);
    const snapshot = JSON.stringify(message);
    const history = buildAssistantHistoryMessages(message);
    expect(history).toHaveLength(1);
    expect(history[0].role).toBe(Role.Assistant);
    expect(JSON.stringify(history[0].content)).toContain("历史文档正文");
    expect(JSON.stringify(history[0].content)).toContain("已读取文档");
    expect(history[0].tool_calls).toBeUndefined();
    expect(JSON.stringify(message)).toBe(snapshot);
  });
});
