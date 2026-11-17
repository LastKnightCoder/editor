import { describe, expect, it } from "vitest";
import {
  agentMessageFromTranscript,
  transcriptFromAgentMessage,
  type PiTranscriptMessage,
} from "../convert";

describe("SDK 消息映射边界", () => {
  it("custom 角色经映射往返保持原对象与全部字段", () => {
    // pi-coding-agent 的 CustomAgentMessages 声明合并若失效（convert.ts 丢失类型导入），
    // custom 角色会在这里被当作未知角色拒绝，而不是静默丢字段。
    const message = {
      role: "custom",
      customType: "desktop-display",
      content: [{ type: "text", text: "原文" }],
      display: true,
      details: { clientId: "client-1" },
      timestamp: 1,
    };
    const roundtrip = agentMessageFromTranscript(transcriptFromAgentMessage(message));
    expect(roundtrip).toBe(message);
  });

  it("缺 SDK 必填字段的历史消息在恢复边界显式拒绝", () => {
    const incomplete: PiTranscriptMessage = {
      role: "assistant",
      content: [{ type: "text", text: "旧档回答" }],
      timestamp: 1,
    };
    expect(() => agentMessageFromTranscript(incomplete)).toThrow(
      expect.objectContaining({
        code: "AI_SESSION_FORMAT_UNSUPPORTED",
        details: {
          role: "assistant",
          missing: ["api", "provider", "model", "usage", "stopReason"],
        },
      })
    );
  });

  it("缺 cost/totalTokens 的历史 usage 仍可恢复，与官方差分夹具同口径", () => {
    // 官方 buildSessionContext 与 session.test.ts 的差分夹具都接受无 cost 的 usage，
    // 本边界不得比官方更严，否则官方能读的旧文件在移动端无法续聊。
    const legacy: PiTranscriptMessage = {
      role: "assistant",
      content: [],
      api: "openai-completions",
      provider: "test-provider",
      model: "test-model",
      usage: { input: 10, output: 4, cacheRead: 2, cacheWrite: 1 },
      stopReason: "stop",
      timestamp: 1,
    };
    expect(agentMessageFromTranscript(legacy)).toBe(legacy);
  });
});
