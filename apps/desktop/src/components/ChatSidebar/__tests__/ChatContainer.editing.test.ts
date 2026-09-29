import { describe, expect, it } from "vitest";
import {
  buildTitleSummaryMessages,
  formatGeneratedChatTitle,
  getRequestMessageText,
  shouldRestoreInputAfterSendError,
  shouldGenerateChatTitle,
} from "../editingUtils";
import { Role } from "@/constants";
import type { ChatMessage, RequestMessage, ResponseMessage } from "@/types";

const createUserMessage = (content: RequestMessage["content"]): RequestMessage => ({
  role: Role.User,
  content,
});

const createAssistantMessage = (content: string): ResponseMessage => ({
  role: Role.Assistant,
  content,
});

describe("ChatContainer 编辑辅助逻辑", () => {
  it("应正确提取用户消息中的纯文本内容", () => {
    const message = createUserMessage([
      { type: "image", image: "file://image.png" },
      { type: "text", text: "第一行" },
      { type: "file", file: "/tmp/demo.pdf", fileName: "demo.pdf" },
      { type: "text", text: "第二行" },
    ]);

    expect(getRequestMessageText(message)).toBe("第一行\n第二行");
  });

  it("主动终止发送时不应恢复已发送内容，真实错误仍应恢复", () => {
    expect(
      shouldRestoreInputAfterSendError({
        name: "AbortError",
        message: "用户主动终止",
      })
    ).toBe(false);
    expect(shouldRestoreInputAfterSendError(new Error("网络异常"))).toBe(true);
  });

  it("应去掉生成标题前后的空白后再截断", () => {
    expect(formatGeneratedChatTitle("\n\n  这是一个测试标题  \n")).toBe("这是一个测试标题");
    expect(
      formatGeneratedChatTitle("\n\n  这是一个超过二十个字符的测试标题用于验证截断行为  ")
    ).toBe("这是一个超过二十个字符的测试标题用于验证");
  });

  it("仅未锁定标题且标题模型可用时才自动总结标题", () => {
    expect(shouldGenerateChatTitle({ titleDirty: false }, true)).toBe(true);
    expect(shouldGenerateChatTitle({ titleDirty: true }, true)).toBe(false);
    expect(shouldGenerateChatTitle({}, true)).toBe(false);
    expect(shouldGenerateChatTitle({ titleDirty: false }, false)).toBe(false);
  });

  it("构造标题总结消息时只保留最近一轮对话的文本内容", () => {
    const chat: ChatMessage = {
      id: "chat-1",
      createTime: 1,
      updateTime: 2,
      title: "新对话",
      titleDirty: false,
      messages: [
        { role: Role.System, content: "system" },
        createUserMessage([{ type: "text", text: "旧问题" }]),
        createAssistantMessage("旧回答"),
        createUserMessage([
          { type: "image", image: "file://image.png" },
          { type: "text", text: "请解释 Codex 模式" },
          { type: "file", file: "/tmp/demo.pdf", fileName: "demo.pdf" },
          { type: "text", text: "并总结风险" },
        ]),
        createAssistantMessage("Codex 模式会通过本地 agent 流式返回回答。"),
      ],
    };

    expect(buildTitleSummaryMessages(chat)).toEqual([
      createUserMessage([
        { type: "text", text: "请解释 Codex 模式" },
        { type: "text", text: "并总结风险" },
      ]),
      {
        role: Role.Assistant,
        content: [
          {
            type: "text",
            text: "Codex 模式会通过本地 agent 流式返回回答。",
          },
        ],
      },
    ]);
  });

  it("构造标题总结消息时会过滤没有文本的最近消息", () => {
    const chat: ChatMessage = {
      id: "chat-1",
      createTime: 1,
      updateTime: 2,
      title: "新对话",
      titleDirty: false,
      messages: [
        { role: Role.System, content: "system" },
        createUserMessage([{ type: "text", text: "旧问题" }]),
        createAssistantMessage("旧回答"),
        createUserMessage([{ type: "image", image: "file://image.png" }]),
        createAssistantMessage(""),
      ],
    };

    expect(buildTitleSummaryMessages(chat)).toEqual([]);
  });

  it("JSONL 投影不带 system 消息时，标题总结照样取最近一轮", () => {
    const chat: ChatMessage = {
      id: "chat-1",
      createTime: 1,
      updateTime: 2,
      title: "新对话",
      titleDirty: false,
      messages: [
        createUserMessage([{ type: "text", text: "只有一问" }]),
        createAssistantMessage("一答"),
      ],
    };
    expect(buildTitleSummaryMessages(chat)).toHaveLength(2);
  });
});
