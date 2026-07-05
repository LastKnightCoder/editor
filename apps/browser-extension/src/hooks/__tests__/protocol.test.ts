import { describe, it, expect, vi } from "vitest";
import type { ChatMessageType } from "@tau/shared";
import {
  buildAiChatRpcPayload,
  fetchCodexAvailabilityViaRpc,
  mapChatMessageToAiRequestMessage,
} from "../useAiChat";
import { fetchSkillsViaRpc } from "../useSkills";

describe("ai.chat 协议映射", () => {
  it("透传 conversationKey 并附带浏览器工具列表", () => {
    const payload = buildAiChatRpcPayload({
      requestId: "req-1",
      messages: [{ role: "user", content: "hello" }],
      systemPrompt: "sys",
      enableTools: true,
      conversationKey: "conv-1",
    });

    expect(payload.conversationKey).toBe("conv-1");
    expect(Array.isArray(payload.browserTools)).toBe(true);
    expect(payload.browserTools?.length).toBeGreaterThan(0);
  });

  it("透传 Codex 代理类型和会话 ID", () => {
    const payload = buildAiChatRpcPayload({
      requestId: "req-codex",
      messages: [{ role: "user", content: "hello codex" }],
      enableTools: true,
      agentType: "codex",
      agentSessionId: "codex-thread-1",
    } as any);

    expect(payload.agentType).toBe("codex");
    expect(payload.agentSessionId).toBe("codex-thread-1");
  });

  it("通过 codex.getAvailability 查询 Codex 可用性", async () => {
    const sendRequest = vi.fn().mockResolvedValue({
      available: true,
      reason: null,
    });
    const wsClient = {
      sendRequest,
    } as unknown as import("@/utils/WebSocketClient").default;

    const availability = await fetchCodexAvailabilityViaRpc(wsClient);

    expect(sendRequest).toHaveBeenCalledWith("codex.getAvailability", {});
    expect(availability).toEqual({ available: true, reason: null });
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

    const mappedUser = mapChatMessageToAiRequestMessage(
      userMessageWithRequestContent,
    );
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
