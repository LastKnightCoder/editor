import { beforeEach, describe, expect, it } from "vitest";
import useChatRunStore from "../useChatRunStore";
import type { ChatRunRecord, ChatSessionKey } from "@/types/chat-run";

const createRun = (
  runId: string,
  sessionKey: ChatSessionKey,
  updatedAt: number,
): ChatRunRecord => ({
  runId,
  sessionKey,
  source: sessionKey.split(":")[0] as ChatRunRecord["source"],
  chatId: Number(sessionKey.split(":")[1]),
  agentType: "local",
  status: "running",
  requestPayload: [],
  userMessageClientId: `${runId}-user`,
  assistantMessageClientId: `${runId}-assistant`,
  agentSessionId: null,
  attempt: 0,
  assistantSnapshot: "",
  reasoningSnapshot: "",
  toolSnapshot: [],
  errorMessage: null,
  createdAt: updatedAt,
  updatedAt,
});

describe("useChatRunStore", () => {
  beforeEach(() => useChatRunStore.getState().setRuns([]));

  it("按 sessionKey 返回各自最新任务", () => {
    useChatRunStore
      .getState()
      .setRuns([
        createRun("main-old", "main-chat:1", 1),
        createRun("main-new", "main-chat:1", 2),
        createRun("pdf", "pdf-chat:1", 3),
      ]);

    expect(useChatRunStore.getState().getForSession("main-chat:1")?.runId).toBe(
      "main-new",
    );
    expect(useChatRunStore.getState().getForSession("pdf-chat:1")?.runId).toBe(
      "pdf",
    );
  });
});
