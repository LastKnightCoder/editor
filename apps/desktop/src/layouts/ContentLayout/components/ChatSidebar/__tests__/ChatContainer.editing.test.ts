import { describe, expect, it } from "vitest";
import {
  buildResetBaseChat,
  formatGeneratedChatTitle,
  getLastUserMessageIndex,
  getRequestMessageText,
} from "../editingUtils";
import { Role } from "@/constants";
import type { ChatMessage, RequestMessage, ResponseMessage } from "@/types";

const createUserMessage = (
  content: RequestMessage["content"],
): RequestMessage => ({
  role: Role.User,
  content,
});

const createAssistantMessage = (content: string): ResponseMessage => ({
  role: Role.Assistant,
  content,
});

describe("ChatContainer 编辑辅助逻辑", () => {
  it("应找到最后一条用户消息索引", () => {
    const messages: ChatMessage["messages"] = [
      { role: Role.System, content: "system" },
      createUserMessage([{ type: "text", text: "问题 1" }]),
      createAssistantMessage("回答 1"),
      createUserMessage([{ type: "text", text: "问题 2" }]),
      createAssistantMessage("回答 2"),
    ];

    expect(getLastUserMessageIndex(messages)).toBe(3);
  });

  it("应正确提取用户消息中的纯文本内容", () => {
    const message = createUserMessage([
      { type: "image", image: "file://image.png" },
      { type: "text", text: "第一行" },
      { type: "file", file: "/tmp/demo.pdf", fileName: "demo.pdf" },
      { type: "text", text: "第二行" },
    ]);

    expect(getRequestMessageText(message)).toBe("第一行\n第二行");
  });

  it("编辑发送时应只保留目标用户消息之前的上下文", () => {
    const chat: ChatMessage = {
      id: 1,
      createTime: 1,
      updateTime: 2,
      title: "测试对话",
      messages: [
        { role: Role.System, content: "system" },
        createUserMessage([{ type: "text", text: "问题 1" }]),
        createAssistantMessage("回答 1"),
        createUserMessage([{ type: "text", text: "问题 2" }]),
        createAssistantMessage("回答 2"),
      ],
    };

    const resetBaseChat = buildResetBaseChat(chat, 2);

    expect(resetBaseChat).not.toBeNull();
    expect(resetBaseChat?.messages).toEqual([
      { role: Role.System, content: "system" },
      createUserMessage([{ type: "text", text: "问题 1" }]),
      createAssistantMessage("回答 1"),
    ]);
  });

  it("应去掉生成标题前后的空白后再截断", () => {
    expect(formatGeneratedChatTitle("\n\n  这是一个测试标题  \n")).toBe(
      "这是一个测试标题",
    );
    expect(
      formatGeneratedChatTitle(
        "\n\n  这是一个超过二十个字符的测试标题用于验证截断行为  ",
      ),
    ).toBe("这是一个超过二十个字符的测试标题用于验证");
  });
});
