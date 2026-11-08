import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import {
  assembleHostSession,
  createFauxModelRuntime,
  createDisplayEntryWriter,
} from "../pi-session-host-core";
import { PiToolCallBridge } from "../pi-session-bridge";
import { PiSubagentHost } from "../pi-subagents/host";
import { PiSessionInteractions } from "../pi-session-interactions";
import type {
  HostedSession,
  PiSessionClient,
  PiSessionCreateRequest,
  SubagentSessionOptions,
} from "../pi-session-host";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "pi-subagent-host-"));
  const faux = fauxProvider({});
  const modelRuntime = await createFauxModelRuntime(join(dir, "auth.json"), faux);
  const sessions = new Map<string, HostedSession>();
  const client: PiSessionClient = {
    isDestroyed: () => false,
    send: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
  };
  const operation = async (id: string, run: (signal: AbortSignal) => Promise<{ ok: boolean }>) => {
    const hosted = sessions.get(id)!;
    const controller = new AbortController();
    const task = Promise.resolve().then(() => run(controller.signal));
    hosted.operations.set(controller, task);
    try {
      return await task;
    } finally {
      hosted.operations.delete(controller);
      runtime.idle(id);
    }
  };
  const dispose = async (id: string) => {
    const hosted = sessions.get(id);
    if (!hosted) return;
    if (hosted.closing) return hosted.closing;
    hosted.closing = (async () => {
      await runtime.release(id);
      await hosted.session.abort();
      hosted.unsubscribe();
      hosted.displayWriter.dispose();
      hosted.interactions.dispose();
      hosted.session.dispose();
      sessions.delete(id);
    })();
    return hosted.closing;
  };
  const create = async (
    _client: PiSessionClient,
    request: PiSessionCreateRequest,
    child?: SubagentSessionOptions
  ) => {
    const native = runtime.tools(request.sessionId, child?.agent);
    const interactions = new PiSessionInteractions({
      sessionId: request.sessionId,
      interactive: true,
      getMode: () => "manual",
      permissionScope: child?.permissionScope,
      tools: native.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: {},
        risk: "read",
      })),
      send: snapshot => client.send("pi-session-interactions", snapshot),
    });
    const session = await assembleHostSession({
      cwd: dir,
      agentDir: dir,
      modelRuntime,
      modelRef: { providerId: faux.provider.id, modelId: faux.getModel().id },
      sessionDir: child?.directory ?? dir,
      ...(request.sessionFile
        ? { sessionFile: join(child?.directory ?? dir, request.sessionFile) }
        : {}),
      sessionId: request.piSessionId,
      customTools: [...native, ...interactions.hostTools()],
      retry: { maxRetries: 0 },
    });
    interactions.install(session);
    const hosted: HostedSession = {
      session,
      sender: client,
      interactions,
      toolSpecs: [],
      operations: new Map(),
      databaseName: "data",
      scope: request.scope,
      interactive: true,
      hostToolsOnly: false,
      modelRef: request.modelRef,
      requestedCwd: dir,
      childAgent: child?.agent,
      systemPromptRef: { current: "按照任务执行", memory: "", memoryDatabase: undefined },
      unsubscribe: session.subscribe(event => runtime.onEvent(request.sessionId, event)),
      bridge: new PiToolCallBridge(client, request.sessionId),
      detachSender: () => {},
      memoryDatabase: undefined,
      bridgedToolNames: new Set(),
      displayWriter: createDisplayEntryWriter(session),
      lastActive: Date.now(),
    };
    sessions.set(request.sessionId, hosted);
    return { ok: true };
  };
  const access: ConstructorParameters<typeof PiSubagentHost>[0] = {
    get: id => sessions.get(id),
    create,
    prompt: (id, text) =>
      operation(id, async () => {
        await sessions.get(id)!.session.prompt(text);
        return { ok: true };
      }),
    abort: async id => {
      await sessions.get(id)?.session.abort();
    },
    dispose,
    operation,
    systemPrompt: () => "按照任务执行",
  };
  const runtime = new PiSubagentHost(access, join(dir, "agents"));
  await create(client, {
    sessionId: "root",
    piSessionId: "parent-session",
    scope: "main",
    cwd: dir,
    modelRef: { providerId: faux.provider.id, modelId: faux.getModel().id },
  });
  runtime.attach("root");
  cleanups.push(async () => {
    await runtime.stop("root");
    for (const id of [...sessions.keys()]) await dispose(id);
    await new Promise(resolve => setTimeout(resolve, 0));
    rmSync(dir, { recursive: true, force: true });
  });
  return { runtime, faux, sessions, client, operation, create, dispose, dir, access };
}

describe("子 Agent 真实 pi 会话接线", () => {
  it("子宿主仍在创建时停止父任务，迟到创建不会开始推理或泄漏宿主", async () => {
    const { runtime, faux, client, sessions, access } = await setup();
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const original = access.create;
    const create = vi.spyOn(access, "create").mockImplementation(async (...args) => {
      await gate;
      return original(...args);
    });
    const run = runtime.service.submit("root", "stop-creating", {
      title: "创建中",
      message: "检查",
      mode: "async",
    });
    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
    await runtime.stop("root");
    release();
    await vi.waitFor(() => expect(sessions.size).toBe(1));
    await new Promise<void>(resolve => setTimeout(resolve, 30));
    expect(runtime.service.repository.read(run.origin.parentKey).runs[0].status).toBe("cancelled");
    expect(runtime.snapshot(client).agents[0].hostId).toBeUndefined();
    expect(sessions.size).toBe(1);
    expect(faux.state.callCount).toBe(0);
    create.mockRestore();
  });
  it("必要工具桥继承失败后回收半成品宿主，父再次发送时重新继承", async () => {
    const { runtime, faux, client } = await setup();
    faux.setResponses([fauxAssistantMessage([fauxText("第二次完成")])]);
    let inheritAttempts = 0;
    vi.mocked(client.send).mockImplementation(channel => {
      if (channel === "pi-subagents:inherit-tools" && ++inheritAttempts === 1)
        throw new Error("工具桥断开");
    });
    const first = runtime.service.submit("root", "bridge-first", {
      title: "工具继承",
      message: "执行",
      mode: "sync",
    });
    expect(await runtime.service.wait(first, "bridge-first")).toMatchObject({
      outcome: { status: "failed", error: { message: "工具桥断开" } },
    });
    runtime.service.toolResult(first.origin.parentKey, "bridge-first", true);
    expect(runtime.snapshot(client).agents[0].hostId).toBeUndefined();
    const next = runtime.service.submit("root", "bridge-next", {
      agentId: first.agentId,
      message: "继续",
      mode: "sync",
    });
    expect(await runtime.service.wait(next, "bridge-next")).toMatchObject({
      outcome: { status: "completed" },
    });
    runtime.service.toolResult(next.origin.parentKey, "bridge-next", true);
    expect(inheritAttempts).toBe(2);
  });
  it("子工具等待审批期间父停用该工具，允许旧请求也不能执行", async () => {
    const { runtime, faux, sessions, dir } = await setup();
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall("write", { path: "revoked.md", content: "不得写入" })], {
        stopReason: "toolUse",
      }),
      fauxAssistantMessage([fauxText("已收到工具处理结果")]),
    ]);
    const run = runtime.service.submit("root", "revoked-write", {
      title: "写入",
      message: "写文件",
      mode: "sync",
    });
    const waiting = runtime.service.wait(run, "revoked-write");
    await vi.waitFor(() =>
      expect(
        [...sessions.values()].some(host => host.interactions.snapshot().approvals.length > 0)
      ).toBe(true)
    );
    const child = [...sessions.values()].find(host => host.childAgent)!;
    const request = child.interactions.snapshot().approvals[0];
    const parent = sessions.get("root")!.session;
    parent.setActiveToolsByName(parent.getActiveToolNames().filter(name => name !== "write"));
    child.interactions.permissions.decide(request.requestId, "allow");
    await waiting;
    runtime.service.toolResult(run.origin.parentKey, "revoked-write", true);
    expect(existsSync(join(dir, "revoked.md"))).toBe(false);
    expect(JSON.stringify(child.session.sessionManager.getBranch())).toContain("停用");
  });

  it("可选状态通知发送失败不改变子 Agent 的执行结果", async () => {
    const { runtime, faux, client } = await setup();
    faux.setResponses([fauxAssistantMessage([fauxText("执行成功")])]);
    vi.mocked(client.send).mockImplementation(channel => {
      if (channel === "pi-subagents:changed") throw new Error("通知端暂不可用");
    });
    const run = runtime.service.submit("root", "unavailable-observer", {
      title: "检查",
      message: "完成任务",
      mode: "sync",
    });
    const waiting = runtime.service.wait(run, "unavailable-observer");
    expect(await waiting).toMatchObject({ outcome: { status: "completed", result: "执行成功" } });
    runtime.service.toolResult(run.origin.parentKey, "unavailable-observer", true);
  });

  it.each(["question", "approval"] as const)(
    "停止等待 %s 的任务后，迟到用户操作不能复活执行",
    async kind => {
      const { runtime, faux, sessions, dir } = await setup();
      faux.setResponses([
        fauxAssistantMessage(
          [
            kind === "question"
              ? fauxToolCall("ask-question", {
                  questions: [
                    { id: "q", question: "要继续吗？", type: "single", options: ["继续", "结束"] },
                  ],
                })
              : fauxToolCall("write", { path: "cancelled.md", content: "不得写入" }),
          ],
          { stopReason: "toolUse" }
        ),
      ]);
      const run = runtime.service.submit("root", `cancel-${kind}`, {
        title: "等待用户",
        message: "执行任务",
        mode: "async",
      });
      await vi.waitFor(() =>
        expect(
          [...sessions.values()].some(host => {
            const snapshot = host.interactions.snapshot();
            return snapshot.questions.length + snapshot.approvals.length > 0;
          })
        ).toBe(true)
      );
      const child = [...sessions.values()].find(host => host.childAgent)!;
      const snapshot = child.interactions.snapshot();
      const request = snapshot.questions[0] ?? snapshot.approvals[0];
      expect(runtime.service.repository.read(run.origin.parentKey).messages).toHaveLength(0);
      await runtime.stop("root");
      await vi.waitFor(() => expect(child.session.isStreaming).toBe(false));
      if (kind === "question")
        expect(
          child.interactions.questions.answer(request.requestId, [
            { questionId: "q", selectedValues: ["继续"], otherText: "" },
          ])
        ).toContain("已结束");
      else expect(child.interactions.permissions.decide(request.requestId, "allow")).toBe(false);
      expect(runtime.service.repository.read(run.origin.parentKey).runs[0].status).toBe(
        "cancelled"
      );
      expect(existsSync(join(dir, "cancelled.md"))).toBe(false);
      expect(
        sessions
          .get("root")!
          .session.sessionManager.getEntries()
          .some(entry => entry.type === "custom_message")
      ).toBe(false);
    }
  );

  it("释放空闲子宿主后重新发送仍恢复原始上下文", async () => {
    const { runtime, faux, sessions, dispose, client } = await setup();
    faux.setResponses([fauxAssistantMessage([fauxText("保留：松柏")])]);
    const first = runtime.service.submit("root", "persist-first", {
      title: "复用",
      message: "记住松柏",
      mode: "sync",
    });
    await runtime.service.wait(first, "persist-first");
    runtime.service.toolResult(first.origin.parentKey, "persist-first", true);
    const oldHostId = runtime.snapshot(client).agents[0].hostId!;
    await dispose(oldHostId);
    faux.setResponses([fauxAssistantMessage([fauxText("仍然记得松柏")])]);
    const next = runtime.service.submit("root", "persist-next", {
      agentId: first.agentId,
      message: "继续之前的任务",
      mode: "sync",
    });
    expect(await runtime.service.wait(next, "persist-next")).toMatchObject({
      outcome: { status: "completed" },
    });
    runtime.service.toolResult(next.origin.parentKey, "persist-next", true);
    const newHostId = runtime.snapshot(client).agents[0].hostId!;
    expect(newHostId).not.toBe(oldHostId);
    expect(JSON.stringify(sessions.get(newHostId)!.session.sessionManager.getBranch())).toContain(
      "记住松柏"
    );
    expect(runtime.snapshot(client).agents[0].runs).toHaveLength(2);
  });

  it("父分支已离开原任务时不把异步结果注入新分支", async () => {
    const { runtime, faux, sessions } = await setup();
    faux.setResponses([fauxAssistantMessage([fauxText("原分支回答")])]);
    const parent = sessions.get("root")!.session;
    await parent.prompt("原分支");
    faux.setResponses([fauxAssistantMessage([fauxText("子结果")])]);
    const run = runtime.service.submit("root", "old-branch", {
      title: "分支任务",
      message: "检查",
      mode: "async",
    });
    parent.sessionManager.resetLeaf();
    parent.refreshContext();
    await vi.waitFor(() =>
      expect(runtime.service.repository.read(run.origin.parentKey).runs[0].status).toBe("completed")
    );
    runtime.idle("root");
    await vi.waitFor(() =>
      expect(runtime.service.repository.read(run.origin.parentKey).messages[0].delivered).toBe(true)
    );
    expect(parent.sessionManager.getBranch().some(entry => entry.type === "custom_message")).toBe(
      false
    );
  });

  it("其他窗口不能读取或取消当前窗口的子任务", async () => {
    const { runtime, faux } = await setup();
    faux.setResponses([fauxAssistantMessage([fauxText("完成")])]);
    const run = runtime.service.submit("root", "owner-only", {
      title: "窗口归属",
      message: "检查",
      mode: "sync",
    });
    await runtime.service.wait(run, "owner-only");
    runtime.service.toolResult(run.origin.parentKey, "owner-only", true);
    const foreign: PiSessionClient = {
      isDestroyed: () => false,
      send: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
    };
    expect(runtime.snapshot(foreign).agents).toHaveLength(0);
    expect(() => runtime.detail(foreign, run.agentId)).toThrow("不属于当前窗口");
    await expect(runtime.cancel(foreign, run.agentId, run.runId)).rejects.toThrow("不属于当前窗口");
  });
  it("同步工具运行子会话，完成后再次发送保留历史和身份", async () => {
    const { runtime, faux, sessions, operation } = await setup();
    faux.setResponses([
      fauxAssistantMessage(
        [fauxToolCall("spawn_agent", { title: "研究", message: "记住暗号：杉树", mode: "sync" })],
        { stopReason: "toolUse" }
      ),
      fauxAssistantMessage([fauxText("已记住杉树")]),
      fauxAssistantMessage([fauxText("第一项完成")]),
    ]);
    await operation("root", async () => {
      await sessions.get("root")!.session.prompt("派发任务");
      return { ok: true };
    });
    const parent = runtime.parent("root");
    const agent = runtime.service.repository.read(parent.key).agents[0];
    expect(agent).toBeDefined();
    expect(runtime.service.repository.read(parent.key).runs[0].outcome).toEqual({
      status: "completed",
      result: "已记住杉树",
    });
    faux.setResponses([fauxAssistantMessage([fauxText("暗号是杉树")])]);
    const run = runtime.service.submit("root", "followup", {
      agentId: agent.agentId,
      message: "之前的暗号是什么？",
      mode: "sync",
    });
    const result = await runtime.service.wait(run, "followup");
    expect(result).toMatchObject({ reason: "terminal", outcome: { result: "暗号是杉树" } });
    const child = [...sessions.values()].find(host => host.childAgent?.agentId === agent.agentId)!;
    const history = JSON.stringify(child.session.sessionManager.getBranch());
    expect(history).toContain("记住暗号：杉树");
    expect(history).toContain("之前的暗号是什么");
    expect(() => runtime.parent([...sessions].find(([, host]) => host === child)![0])).toThrow(
      "只能由有效的父会话"
    );
    runtime.service.toolResult(parent.key, "followup", true);
  });

  it("ask-question 仅产生交互快照，wait 持续等待，回答后同一 Run 完成", async () => {
    const { runtime, faux, sessions, client } = await setup();
    faux.setResponses([
      fauxAssistantMessage(
        [
          fauxToolCall("ask-question", {
            questions: [{ id: "q1", question: "选哪个？", type: "single", options: ["甲", "乙"] }],
          }),
        ],
        { stopReason: "toolUse" }
      ),
      fauxAssistantMessage([fauxText("已根据回答完成")]),
    ]);
    const run = runtime.service.submit("root", "question-task", {
      title: "询问",
      message: "请先询问用户",
      mode: "sync",
    });
    const waiting = runtime.service.wait(run, "question-task");
    let answered = false;
    void waiting.then(() => {
      answered = true;
    });
    await vi.waitFor(() =>
      expect(
        [...sessions.values()].some(host => host.interactions.snapshot().questions.length > 0)
      ).toBe(true)
    );
    expect(answered).toBe(false);
    expect(runtime.service.repository.read(run.origin.parentKey).messages).toEqual([]);
    expect(client.send).toHaveBeenCalledWith(
      "pi-session-interactions",
      expect.objectContaining({ questions: expect.any(Array) })
    );
    const child = [...sessions.values()].find(host => host.childAgent)!;
    const request = child.interactions.snapshot().questions[0];
    child.interactions.questions.answer(request.requestId, [
      { questionId: "q1", selectedValues: ["甲"], otherText: "" },
    ]);
    expect(await waiting).toMatchObject({
      runId: run.runId,
      reason: "terminal",
      outcome: { status: "completed" },
    });
    runtime.service.toolResult(run.origin.parentKey, "question-task", true);
  });

  it("异步完成后以自定义消息唤醒空闲父会话，重复检查不会再唤醒", async () => {
    const { runtime, faux, sessions } = await setup();
    faux.setResponses([fauxAssistantMessage([fauxText("父先结束")])]);
    await sessions.get("root")!.session.prompt("先做自己的任务");
    faux.setResponses([
      fauxAssistantMessage([fauxText("子任务完成")]),
      fauxAssistantMessage([fauxText("父收到并处理")]),
    ]);
    const run = runtime.service.submit("root", "async-task", {
      title: "后台任务",
      message: "继续检查",
      mode: "async",
    });
    await vi.waitFor(() =>
      expect(
        runtime.service.repository
          .read(run.origin.parentKey)
          .messages.every(message => message.delivered) &&
          runtime.service.repository.read(run.origin.parentKey).messages.length > 0
      ).toBe(true)
    );
    const parent = sessions.get("root")!.session;
    expect(JSON.stringify(parent.sessionManager.getBranch())).toContain("父收到并处理");
    const before = parent.sessionManager.getEntries().length;
    runtime.idle("root");
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(parent.sessionManager.getEntries()).toHaveLength(before);
  });
});
