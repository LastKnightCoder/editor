import { describe, it, expect, vi } from "vitest";
import type { ChatMessageType } from "@tau/shared";
import { applyChatStreamEvent, createAssistantMessage, createRunEventFilter } from "@tau/shared";
import {
  buildAiRunStartParams,
  buildResumedMessages,
  mapChatMessageToAiRequestMessage,
} from "../useAiChat";
import { fetchSkillsViaRpc } from "../useSkills";

describe("ai.run.start 协议（v2）", () => {
  it("选择的思考档位进入运行参数", () => {
    expect(
      buildAiRunStartParams({
        runId: "r",
        messages: [{ role: "user", content: "问" }],
        enableTools: true,
        thinkingLevel: "high",
      }).thinkingLevel
    ).toBe("high");
  });
  it("带扩展页面工具，不带扩展本地的 ask-question（提问改走桌面宿主）", () => {
    const params = buildAiRunStartParams({
      runId: "run-1",
      messages: [{ role: "user", content: "hello" }],
      systemPrompt: "sys",
      enableTools: true,
    });

    expect(params.runId).toBe("run-1");
    const names = params.browserTools?.map(tool => tool.function.name) ?? [];
    expect(names).toContain("get_page_content");
    expect(names).not.toContain("ask-question");
  });

  it("持久对话带 session；纯文本单发不带工具", () => {
    const params = buildAiRunStartParams({
      runId: "run-2",
      messages: [{ role: "user", content: "hello" }],
      enableTools: false,
      session: { id: "s1", pageUrl: "https://a.com" },
    });
    expect(params.session).toEqual({ id: "s1", pageUrl: "https://a.com" });
    expect(params).not.toHaveProperty("browserTools");
  });

  it("事件过滤：只收本 runId，丢弃乱序与重复", () => {
    const accept = createRunEventFilter("run-1");
    const event = { type: "turn-finish", turnId: "t" } as const;
    expect(accept({ runId: "other", seq: 0, event })).toBeNull();
    expect(accept({ runId: "run-1", seq: 0, event })).toEqual(event);
    expect(accept({ runId: "run-1", seq: 0, event })).toBeNull();
    expect(accept({ runId: "run-1", seq: 2, event })).toEqual(event);
    expect(accept({ runId: "run-1", seq: 1, event })).toBeNull();
  });

  it("接回在跑的一轮：从快照的 lastSeq 续接，快照已含的事件丢弃", () => {
    const accept = createRunEventFilter("run-1", 4);
    const event = { type: "turn-finish", turnId: "t" } as const;
    expect(accept({ runId: "run-1", seq: 3, event })).toBeNull();
    expect(accept({ runId: "run-1", seq: 4, event })).toBeNull();
    expect(accept({ runId: "run-1", seq: 5, event })).toEqual(event);
  });

  it("接回的界面 = 本轮之前的对话 + 本轮提问 + 到此刻的回答", () => {
    const response = createAssistantMessage();
    applyChatStreamEvent(response, { type: "text", turnId: "t1", fullText: "写到一半" });
    const messages = buildResumedMessages(
      {
        runId: "run-1",
        lastSeq: 3,
        baseMessages: [
          { role: "user", content: "上一问", clientId: "u0" } as never,
          { role: "assistant", content: "上一答", clientId: "a0" } as never,
        ],
        request: {
          role: "user",
          content: [
            { type: "text", text: "这一问" },
            { type: "image", image: "data:image/png;base64,xx" },
          ],
        },
        response,
        interactions: { approvals: [], questions: [] },
        retry: null,
      },
      "assistant-id"
    );
    expect(messages.map(message => [message.role, message.content])).toEqual([
      ["user", "上一问"],
      ["assistant", "上一答"],
      ["user", "这一问\n[图片]"],
      ["assistant", "写到一半"],
    ]);
    expect(messages.at(-1)!.id).toBe("assistant-id");
    expect((messages[2] as { requestContent?: unknown[] }).requestContent).toHaveLength(2);
  });

  it("支持 user/assistant/tool 历史消息映射", () => {
    const assistantToolCall = {
      id: "call-1",
      type: "function" as const,
      function: {
        name: "ask-question",
        arguments: '{"questions":[]}',
      },
    };

    const assistantMessage: ChatMessageType = {
      id: "m-a",
      role: "assistant",
      content: "",
      reasoning: "先思考一下",
      timestamp: 1000,
      tool_calls: [assistantToolCall],
    };
    const toolMessage: ChatMessageType = {
      id: "m-t",
      role: "tool",
      content: '{"type":"ask-question-result"}',
      timestamp: 1100,
      name: "ask-question",
      tool_call_id: "call-1",
    };
    const userMessageWithRequestContent = {
      id: "m-u",
      role: "user" as const,
      content: "图片问题",
      requestContent: [
        { type: "text" as const, text: "请看图" },
        { type: "image" as const, image: "data:image/png;base64,xxx" },
      ],
      timestamp: 900,
    } as ChatMessageType;

    const mappedUser = mapChatMessageToAiRequestMessage(userMessageWithRequestContent);
    const mappedAssistant = mapChatMessageToAiRequestMessage(assistantMessage);
    const mappedTool = mapChatMessageToAiRequestMessage(toolMessage);

    expect(Array.isArray(mappedUser.content)).toBe(true);
    expect(mappedAssistant.tool_calls?.[0].id).toBe("call-1");
    expect(mappedAssistant.reasoning_content).toBe("先思考一下");
    expect(mappedTool.role).toBe("tool");
    expect(mappedTool.tool_call_id).toBe("call-1");
    expect(mappedTool.name).toBe("ask-question");
  });
});

describe("settings.getSkills 协议", () => {
  it("通过 settings.getSkills 拉取技能列表", async () => {
    const sendRequest = vi
      .fn()
      .mockResolvedValue({ skills: [{ folderName: "demo", name: "Demo" }] });
    const wsClient = {
      sendRequest,
    } as unknown as import("@/utils/WebSocketClient").default;

    const skills = await fetchSkillsViaRpc(wsClient);

    expect(sendRequest).toHaveBeenCalledWith("settings.getSkills", {});
    expect(skills).toEqual([{ folderName: "demo", name: "Demo" }]);
  });
});

describe("退役代理历史上下文", () => {
  it("将历史工具输出转为助手正文，保留原消息", () => {
    const message: ChatMessageType = {
      id: "legacy",
      role: "assistant",
      content: "已查询",
      timestamp: 1,
      contentBlocks: [
        {
          type: "tool_calls",
          executions: [
            {
              toolCallId: "old-call",
              toolName: "legacy-tool",
              status: "success",
              input: "{}",
              output: "历史结果",
              timestamp: 1,
              metadata: { codexItemType: "mcp_tool_call" },
            },
          ],
        },
      ],
    };
    const snapshot = JSON.stringify(message);
    const request = mapChatMessageToAiRequestMessage(message);
    expect(request.tool_calls).toBeUndefined();
    expect(request.content).toContain("历史结果");
    expect(request.content).toContain("已查询");
    expect(JSON.stringify(message)).toBe(snapshot);
  });
});
