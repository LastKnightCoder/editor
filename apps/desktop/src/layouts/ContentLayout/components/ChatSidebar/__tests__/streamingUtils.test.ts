import { describe, expect, it, vi } from "vitest";
import { Role } from "@/constants";
import type { ChatMessage, ResponseMessage } from "@/types";
import { withStreamingUpdateTime } from "../streamingUtils";

const createChat = (assistantMessage: ResponseMessage): ChatMessage => ({
  id: "chat-1",
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
});
