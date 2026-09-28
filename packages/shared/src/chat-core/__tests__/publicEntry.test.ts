// @vitest-environment node
import { expect, it } from "vitest";
import {
  AI_RUN_METHODS,
  createAssistantMessage,
  applyChatStreamEvent,
} from "@tau/shared/chat-core";

it("公共聊天入口可在没有 DOM 的主进程环境加载", () => {
  expect(typeof globalThis.document).toBe("undefined");
  expect(AI_RUN_METHODS.start).toBe("ai.run.start");
  const response = createAssistantMessage();
  applyChatStreamEvent(response, { type: "text", turnId: "turn", fullText: "你好" });
  expect(response.content).toBe("你好");
});
