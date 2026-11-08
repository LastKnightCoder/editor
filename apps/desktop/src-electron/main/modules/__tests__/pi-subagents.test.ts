import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SubagentOutcome } from "@/types/subagent";
import { SubagentRepository } from "../pi-subagents/repository";
import { SubagentService, type SubagentHost, type SubagentParent } from "../pi-subagents/service";
import { createSubagentTools } from "../pi-subagents/tools";
import { SubagentResultCollector } from "../pi-subagents/state";
import { fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function setup(concurrency = 2) {
  const dir = mkdtempSync(join(tmpdir(), "tau-subagents-"));
  roots.push(dir);
  const parent: SubagentParent = {
    key: "library:parent",
    hostId: "parent",
    scope: "main",
    databaseName: "data",
    cwd: dir,
    branchId: "branch",
  };
  const resolvers = new Map<string, (outcome: SubagentOutcome) => void>();
  const host: SubagentHost = {
    parent: vi.fn(() => parent),
    execute: vi.fn(
      (_parent, _agent, run, signal) =>
        new Promise<SubagentOutcome>(resolve => {
          resolvers.set(run.runId, resolve);
          signal.addEventListener("abort", () => resolve({ status: "cancelled" }), { once: true });
        })
    ),
    deliver: vi.fn(async () => true),
    changed: vi.fn(),
  };
  const repository = new SubagentRepository(dir);
  const service = new SubagentService(repository, host, concurrency);
  const spawn = (key: string, mode: "sync" | "async" = "async") =>
    service.submit("parent", key, { title: key, message: key, mode });
  const finish = (id: string, outcome: SubagentOutcome = { status: "completed", result: "结果" }) =>
    resolvers.get(id)!(outcome);
  return { dir, host, parent, repository, service, spawn, finish };
}

describe("可复用子 Agent", () => {
  it("开始执行前写盘失败时报告失败，不启动模型也不留下永久等待", async () => {
    const { spawn, service, repository, host, parent } = setup();
    const run = spawn("disk-failure");
    vi.spyOn(repository, "update").mockImplementationOnce(() => {
      throw new Error("disk full");
    });
    const waiting = service.wait(run, "wait-disk");
    await expect(waiting).resolves.toMatchObject({
      reason: "terminal",
      outcome: { status: "failed", error: { message: "执行状态保存失败：disk full" } },
    });
    expect(host.execute).not.toHaveBeenCalled();
    service.toolResult(parent.key, "wait-disk", true);
  });
  it("一次性父入口明确拒绝异步任务，不留下无人持有的执行", () => {
    const { spawn, parent, repository } = setup();
    parent.canRunAsync = false;
    expect(() => spawn("one-shot")).toThrow("mode=sync");
    expect(repository.read(parent.key).runs).toEqual([]);
  });
  it("限制跨会话并发，同一会话后续消息串行，重复提交不重复创建", async () => {
    const { spawn, service, host, finish, repository, parent } = setup();
    const first = spawn("first");
    const second = spawn("second");
    const third = spawn("third");
    expect(spawn("first").runId).toBe(first.runId);
    const followup = service.submit("parent", "followup", {
      agentId: first.agentId,
      message: "继续",
      mode: "async",
    });
    await tick();
    expect(host.execute).toHaveBeenCalledTimes(2);
    finish(second.runId);
    await tick();
    expect(host.execute).toHaveBeenCalledTimes(3);
    expect(repository.read(parent.key).runs.find(run => run.runId === followup.runId)?.status).toBe(
      "queued"
    );
    finish(first.runId);
    await tick();
    expect(host.execute).toHaveBeenCalledTimes(4);
    finish(third.runId);
    finish(followup.runId);
    await tick();
  });

  it("父停止同时取消运行与排队任务，迟到完成不唤醒父", async () => {
    const { spawn, service, host, repository, parent } = setup(1);
    spawn("first");
    spawn("second");
    await tick();
    await service.stopParent(parent.key);
    await tick();
    expect(repository.read(parent.key).runs.map(run => run.status)).toEqual([
      "cancelled",
      "cancelled",
    ]);
    expect(host.execute).toHaveBeenCalledTimes(1);
    expect(host.deliver).not.toHaveBeenCalled();
  });

  it("失败保留真实原因，不自动重试；父发送新消息复用原身份", async () => {
    const { spawn, service, host, finish, repository, parent } = setup();
    const first = spawn("first");
    await tick();
    finish(first.runId, { status: "failed", error: { message: "Connection reset" } });
    await tick();
    expect(host.execute).toHaveBeenCalledTimes(1);
    expect(repository.read(parent.key).runs[0].outcome).toEqual({
      status: "failed",
      error: { message: "Connection reset" },
    });
    expect(host.deliver).toHaveBeenCalledWith(
      parent,
      expect.arrayContaining([expect.objectContaining({ runId: first.runId })]),
      true
    );
    const next = service.submit("parent", "continue", {
      agentId: first.agentId,
      message: "继续",
      mode: "async",
    });
    await tick();
    expect(next.agentId).toBe(first.agentId);
    expect(next.runId).not.toBe(first.runId);
    expect(host.execute).toHaveBeenCalledTimes(2);
    finish(next.runId);
    await tick();
  });

  it("wait 超时不取消任务，也不会为用户交互提前返回", async () => {
    const { spawn, service, finish, repository, parent } = setup();
    const run = spawn("first");
    await tick();
    const result = await service.wait(run, "wait-call", undefined, 1);
    expect(result.reason).toBe("timeout");
    expect(repository.read(parent.key).runs[0].status).toBe("running");
    finish(run.runId);
    await tick();
  });

  it("结果由 wait 回写父上下文后，不再自动通知；重复等待仍可读", async () => {
    const { spawn, service, host, finish, parent } = setup();
    const run = spawn("first");
    const waiting = service.wait(run, "wait-call");
    await tick();
    finish(run.runId);
    expect((await waiting).reason).toBe("terminal");
    await tick();
    expect(host.deliver).not.toHaveBeenCalled();
    service.toolResult(parent.key, "wait-call", true);
    await tick();
    expect(host.deliver).not.toHaveBeenCalled();
    expect((await service.wait(run, "wait-again")).reason).toBe("terminal");
    service.toolResult(parent.key, "wait-again", true);
  });

  it("取消排队的后续任务不会误取消同一 Agent 正在运行的任务", async () => {
    const { spawn, service, repository, parent, finish } = setup();
    const first = spawn("first");
    const second = service.submit("parent", "next", {
      agentId: first.agentId,
      message: "下一项",
      mode: "async",
    });
    await tick();
    await service.cancel(second);
    expect(repository.read(parent.key).runs[0].status).toBe("running");
    finish(first.runId);
    await tick();
  });

  it("消息投递期间有新结果到达，继续排空而不丢通知", async () => {
    const { spawn, host, finish, repository, parent } = setup();
    let delivered!: () => void;
    vi.mocked(host.deliver).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          delivered = () => resolve(true);
        })
    );
    const first = spawn("first");
    const second = spawn("second");
    await tick();
    finish(first.runId);
    await tick();
    finish(second.runId);
    await tick();
    delivered();
    await tick();
    expect(host.deliver).toHaveBeenCalledTimes(2);
    expect(repository.read(parent.key).messages.every(message => message.delivered)).toBe(true);
  });

  it("重开记录将遗留执行标为中断，保留身份且不自行重放", async () => {
    const { spawn, dir, repository, parent, service } = setup();
    const run = spawn("first");
    await tick();
    const restored = new SubagentRepository(dir).read(parent.key);
    expect(restored.agents[0].agentId).toBe(run.agentId);
    expect(restored.runs[0].status).toBe("interrupted");
    expect(restored.messages[0].payload.kind).toBe("terminal");
    expect(repository.read(parent.key).runs[0].status).toBe("running");
    await service.stopParent(parent.key);
    await tick();
  });

  it("子工具集仅允许报告父，不能派发或操作其他 Agent", async () => {
    const { spawn, service, repository, parent } = setup();
    spawn("first");
    const tools = createSubagentTools(service, "child", repository.read(parent.key).agents[0]);
    expect(tools.map(tool => tool.name)).toEqual(["send_parent"]);
    expect(() => service.resolveRun("parent", "foreign-agent")).toThrow("没有对应");
    await service.stopParent(parent.key);
    await tick();
  });

  it("settled 不等于成功，最终模型错误原样保留", () => {
    const collector = new SubagentResultCollector();
    collector.accept({ type: "agent_settled" });
    expect(collector.result().status).toBe("interrupted");
    collector.accept({
      type: "message_end",
      message: fauxAssistantMessage([fauxText("部分输出")], {
        stopReason: "error",
        errorMessage: "Connection reset",
      }),
    });
    expect(collector.result()).toEqual({
      status: "failed",
      error: { message: "Connection reset" },
    });
  });
});
