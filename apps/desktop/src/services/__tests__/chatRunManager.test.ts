import { beforeEach, describe, expect, it, vi } from "vitest";

const commandMocks = vi.hoisted(() => ({
  create: vi.fn(),
  deleteRun: vi.fn(),
  deleteSession: vi.fn(),
  getActive: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/commands/chat-run", () => ({
  createChatRun: commandMocks.create,
  deleteChatRun: commandMocks.deleteRun,
  deleteChatRunsForSession: commandMocks.deleteSession,
  getActiveChatRuns: commandMocks.getActive,
  updateChatRun: commandMocks.update,
}));

import { ChatRunManager } from "../chatRunManager";
import useChatRunStore from "@/stores/useChatRunStore";
import type { ChatRunRecord } from "@/types/chat-run";

const createRun = (
  runId: string,
  sessionKey: ChatRunRecord["sessionKey"],
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
  createdAt: 1,
  updatedAt: 1,
});

describe("ChatRunManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    useChatRunStore.getState().setRuns([]);
    commandMocks.create.mockImplementation(async (record) => ({
      ...record,
      createdAt: 1,
      updatedAt: 1,
    }));
    commandMocks.deleteRun.mockResolvedValue(1);
    commandMocks.deleteSession.mockResolvedValue(0);
    commandMocks.getActive.mockResolvedValue([]);
    commandMocks.update.mockResolvedValue(null);
  });

  it("水合时将无法继续执行的活动任务统一标记为中断", async () => {
    const manager = new ChatRunManager();
    commandMocks.getActive.mockResolvedValue([
      { ...createRun("queued-run", "main-chat:1"), status: "queued" },
      { ...createRun("running-run", "main-chat:2"), status: "running" },
      { ...createRun("retrying-run", "main-chat:3"), status: "retrying" },
      {
        ...createRun("waiting-run", "main-chat:4"),
        status: "waiting_input",
      },
    ]);

    await manager.hydrate();

    expect(Object.values(useChatRunStore.getState().runs)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ runId: "queued-run", status: "interrupted" }),
        expect.objectContaining({
          runId: "running-run",
          status: "interrupted",
        }),
        expect.objectContaining({
          runId: "retrying-run",
          status: "interrupted",
        }),
        expect.objectContaining({
          runId: "waiting-run",
          status: "waiting_input",
        }),
      ]),
    );
    expect(commandMocks.update).toHaveBeenCalledTimes(3);
  });

  it("按 sessionKey 隔离快照、订阅和取消操作", async () => {
    const manager = new ChatRunManager();
    const first = await manager.start(createRun("main-run", "main-chat:1"));
    const second = await manager.start(createRun("pdf-run", "pdf-chat:1"));
    const updates: string[] = [];
    manager.subscribe("main-chat:1", (run) =>
      updates.push(run.assistantSnapshot),
    );

    manager.update(first.runId, { assistantSnapshot: "主会话内容" });
    manager.update(second.runId, { assistantSnapshot: "PDF 会话内容" });
    manager.cancel("main-chat:1");

    expect(manager.getSnapshot("main-chat:1")).toMatchObject({
      runId: first.runId,
      status: "cancelled",
      assistantSnapshot: "主会话内容",
    });
    expect(manager.getSnapshot("pdf-chat:1")).toMatchObject({
      runId: second.runId,
      status: "running",
      assistantSnapshot: "PDF 会话内容",
    });
    expect(updates).toEqual(["", "主会话内容", "主会话内容"]);
  });

  it("恢复任务复用 runId，并避免创建第二条任务", async () => {
    const manager = new ChatRunManager();
    const interrupted = {
      ...createRun("resume-run", "main-chat:2"),
      status: "interrupted" as const,
    };
    useChatRunStore.getState().setRuns([interrupted]);

    const resumed = await manager.resume(interrupted.runId);
    const started = await manager.start({
      ...resumed!,
      runId: resumed!.runId,
      assistantSnapshot: "恢复中的内容",
    });

    expect(started.runId).toBe(interrupted.runId);
    expect(started.status).toBe("running");
    expect(started.assistantSnapshot).toBe("恢复中的内容");
    expect(commandMocks.create).not.toHaveBeenCalled();
  });

  it("节流持久化不会用旧快照覆盖内存中的新快照", async () => {
    const manager = new ChatRunManager();
    const run = await manager.start(createRun("snapshot-run", "main-chat:3"));

    manager.update(run.runId, { assistantSnapshot: "第一段" });
    manager.update(run.runId, { assistantSnapshot: "完整内容" });
    await vi.advanceTimersByTimeAsync(250);

    expect(manager.getSnapshot("main-chat:3")?.assistantSnapshot).toBe(
      "完整内容",
    );
    expect(commandMocks.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ assistantSnapshot: "完整内容" }),
    );
  });

  it("创建任务期间删除会话会精确清理迟到的任务", async () => {
    const manager = new ChatRunManager();
    let resolveCreate: ((record: ChatRunRecord) => void) | undefined;
    commandMocks.create.mockImplementation(
      () =>
        new Promise<ChatRunRecord>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const pendingStart = manager.start(createRun("late-run", "main-chat:4"));

    await manager.discardSession("main-chat:4");
    resolveCreate?.(createRun("late-run", "main-chat:4"));

    await expect(pendingStart).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(commandMocks.deleteRun).toHaveBeenCalledWith("late-run");
    expect(manager.getSnapshot("main-chat:4")).toBeNull();
  });

  it("迟到任务的清理不会删除会话删除后创建的新任务", async () => {
    const manager = new ChatRunManager();
    let resolveFirstCreate: ((record: ChatRunRecord) => void) | undefined;
    commandMocks.create
      .mockImplementationOnce(
        () =>
          new Promise<ChatRunRecord>((resolve) => {
            resolveFirstCreate = resolve;
          }),
      )
      .mockImplementationOnce(async (record) => ({
        ...record,
        createdAt: 2,
        updatedAt: 2,
      }));
    const staleStart = manager.start(createRun("stale-run", "main-chat:5"));

    await manager.discardSession("main-chat:5");
    const currentRun = await manager.start(
      createRun("current-run", "main-chat:5"),
    );
    resolveFirstCreate?.(createRun("stale-run", "main-chat:5"));

    await expect(staleStart).rejects.toMatchObject({ name: "AbortError" });
    expect(commandMocks.deleteRun).toHaveBeenCalledWith("stale-run");
    expect(commandMocks.deleteSession).toHaveBeenCalledTimes(1);
    expect(manager.getSnapshot("main-chat:5")?.runId).toBe(currentRun.runId);
  });

  it("任务已被删除时拒绝挂载迟到的控制器", async () => {
    const manager = new ChatRunManager();
    const run = await manager.start(createRun("controller-run", "main-chat:6"));
    await manager.discardSession("main-chat:6");
    const controller = new AbortController();

    manager.attachController(run.runId, controller);

    expect(controller.signal.aborted).toBe(true);
  });
});
