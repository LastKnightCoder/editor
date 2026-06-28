import { describe, expect, it, vi } from "vitest";
import { Role } from "@/constants";
import type { ChatMessage, ResponseMessage } from "@/types";
import {
  getStreamingScrollKey,
  withStreamingUpdateTime,
} from "../streamingUtils";

const createChat = (assistantMessage: ResponseMessage): ChatMessage => ({
  id: 1,
  createTime: 100,
  updateTime: 200,
  title: "测试对话",
  messages: [
    { role: Role.System, content: "system" },
    { role: Role.User, content: [{ type: "text", text: "问题" }] },
    assistantMessage,
  ],
});

describe("ChatSidebar streaming utils", () => {
  it("流式快照应刷新本地 updateTime", () => {
    vi.spyOn(Date, "now").mockReturnValue(500);

    const chat = createChat({
      role: Role.Assistant,
      content: "第一段",
      assistant_blocks: [
        {
          id: "turn-1:text",
          turnId: "turn-1",
          type: "text",
          state: "streaming",
          content: "第一段",
        },
      ],
    });

    expect(withStreamingUpdateTime(chat).updateTime).toBe(500);
  });

  it("流式快照不应让 updateTime 倒退", () => {
    vi.spyOn(Date, "now").mockReturnValue(100);

    const chat = createChat({
      role: Role.Assistant,
      content: "第一段",
      assistant_blocks: [
        {
          id: "turn-1:text",
          turnId: "turn-1",
          type: "text",
          state: "streaming",
          content: "第一段",
        },
      ],
    });

    expect(withStreamingUpdateTime(chat).updateTime).toBe(200);
  });

  it("正文增量变化应改变滚动 key", () => {
    const first = getStreamingScrollKey(
      createChat({
        role: Role.Assistant,
        content: "你好",
        assistant_blocks: [
          {
            id: "turn-1:text",
            turnId: "turn-1",
            type: "text",
            state: "streaming",
            content: "你好",
          },
        ],
      }),
      2,
    );
    const second = getStreamingScrollKey(
      createChat({
        role: Role.Assistant,
        content: "你好，世界",
        assistant_blocks: [
          {
            id: "turn-1:text",
            turnId: "turn-1",
            type: "text",
            state: "streaming",
            content: "你好，世界",
          },
        ],
      }),
      2,
    );

    expect(second).not.toBe(first);
  });

  it("推理增量变化应改变滚动 key", () => {
    const first = getStreamingScrollKey(
      createChat({
        role: Role.Assistant,
        content: "",
        reasoning_content: "分析",
        assistant_blocks: [
          {
            id: "turn-1:reasoning",
            turnId: "turn-1",
            type: "reasoning",
            state: "streaming",
            content: "分析",
          },
        ],
      }),
      2,
    );
    const second = getStreamingScrollKey(
      createChat({
        role: Role.Assistant,
        content: "",
        reasoning_content: "分析更多",
        assistant_blocks: [
          {
            id: "turn-1:reasoning",
            turnId: "turn-1",
            type: "reasoning",
            state: "streaming",
            content: "分析更多",
          },
        ],
      }),
      2,
    );

    expect(second).not.toBe(first);
  });

  it("工具调用状态变化应改变滚动 key", () => {
    const baseToolCall = {
      id: "call-1",
      type: "function" as const,
      function: {
        name: "search_resource_content",
        arguments: '{"query":"缓存"}',
      },
    };
    const first = getStreamingScrollKey(
      createChat({
        role: Role.Assistant,
        content: "",
        assistant_blocks: [
          {
            id: "call-1",
            turnId: "turn-1",
            type: "tool_call",
            state: "streaming",
            toolCall: baseToolCall,
            execution: {
              toolCallId: "call-1",
              toolName: "search_resource_content",
              status: "executing",
              input: '{"query":"缓存"}',
              timestamp: 100,
            },
          },
        ],
      }),
      2,
    );
    const second = getStreamingScrollKey(
      createChat({
        role: Role.Assistant,
        content: "",
        assistant_blocks: [
          {
            id: "call-1",
            turnId: "turn-1",
            type: "tool_call",
            state: "streaming",
            toolCall: baseToolCall,
            execution: {
              toolCallId: "call-1",
              toolName: "search_resource_content",
              status: "success",
              input: '{"query":"缓存"}',
              output: "找到 3 条结果",
              timestamp: 100,
            },
          },
        ],
      }),
      2,
    );

    expect(second).not.toBe(first);
  });
});
