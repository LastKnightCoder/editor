import { describe, expect, it } from "vitest";
import {
  buildFullHistoryMessages,
  buildResetBaseChat,
  buildTitleSummaryMessages,
  formatGeneratedChatTitle,
  getLastUserMessageIndex,
  getRequestMessageText,
  shouldGenerateChatTitle,
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

const createAssistantHistoryMessage = (
  content: string,
  turnId: string,
): ResponseMessage => ({
  role: Role.Assistant,
  content,
  assistant_blocks: [
    {
      id: `${turnId}:text`,
      turnId,
      type: "text",
      state: "final",
      content,
    },
  ],
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

  it("仅未锁定标题且标题模型可用时才自动总结标题", () => {
    expect(shouldGenerateChatTitle({ titleDirty: false }, true)).toBe(true);
    expect(shouldGenerateChatTitle({ titleDirty: true }, true)).toBe(false);
    expect(shouldGenerateChatTitle({}, true)).toBe(false);
    expect(shouldGenerateChatTitle({ titleDirty: false }, false)).toBe(false);
  });

  it("构造标题总结消息时只保留最近一轮对话的文本内容", () => {
    const chat: ChatMessage = {
      id: 1,
      createTime: 1,
      updateTime: 2,
      title: "新对话",
      titleDirty: false,
      agentType: "codex",
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
      id: 1,
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

  it("构造请求历史时不应截断超过 20 组的对话", () => {
    const messages: ChatMessage["messages"] = [
      { role: Role.System, content: "system" },
    ];
    for (let index = 1; index <= 25; index += 1) {
      messages.push(
        createUserMessage([{ type: "text", text: `问题 ${index}` }]),
        createAssistantHistoryMessage(`回答 ${index}`, `turn-${index}`),
      );
    }
    const chat: ChatMessage = {
      id: 1,
      createTime: 1,
      updateTime: 2,
      title: "长对话",
      messages,
    };

    const history = buildFullHistoryMessages(chat);

    expect(history).toHaveLength(50);
    expect(history[0]).toEqual(
      createUserMessage([{ type: "text", text: "问题 1" }]),
    );
    expect(history.at(-1)).toEqual({
      role: Role.Assistant,
      content: [{ type: "text", text: "回答 25" }],
    });
  });

  it("构造请求历史时保留 assistant/tool 调用链顺序", () => {
    const assistantToolCall: ResponseMessage = {
      role: Role.Assistant,
      content: "",
      assistant_blocks: [
        {
          id: "call-1",
          turnId: "turn-1",
          type: "tool_call",
          state: "final",
          toolCall: {
            id: "call-1",
            type: "function",
            function: {
              name: "search_docs",
              arguments: '{"q":"cache"}',
            },
          },
          execution: {
            toolCallId: "call-1",
            toolName: "search_docs",
            status: "success",
            input: '{"q":"cache"}',
            output: "搜索完成",
            timestamp: 1000,
          },
        },
      ],
    };
    const chat: ChatMessage = {
      id: 1,
      createTime: 1,
      updateTime: 2,
      title: "工具对话",
      messages: [
        { role: Role.System, content: "system" },
        createUserMessage([{ type: "text", text: "查资料" }]),
        assistantToolCall,
        createUserMessage([{ type: "text", text: "继续" }]),
      ],
    };

    const history = buildFullHistoryMessages(chat);

    expect(history).toEqual([
      createUserMessage([{ type: "text", text: "查资料" }]),
      {
        role: Role.Assistant,
        content: "",
        reasoning_content: "",
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            function: {
              name: "search_docs",
              arguments: '{"q":"cache"}',
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
      createUserMessage([{ type: "text", text: "继续" }]),
    ]);
  });
});
