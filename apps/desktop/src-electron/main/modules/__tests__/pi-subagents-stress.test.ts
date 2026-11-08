import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import type { SubagentOutcome, SubagentRun } from "@/types/subagent";
import { isSubagentTerminal } from "@/types/subagent";
import { SubagentRepository } from "../pi-subagents/repository";
import { SubagentService, type SubagentHost, type SubagentParent } from "../pi-subagents/service";
import { errorMessage } from "../pi-subagents/state";
import { PiSessionInteractions } from "../pi-session-interactions";
import { PiPermissionScope } from "../pi-permission-scope";

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

function harness(concurrency = 3, auto = false) {
  const dir = mkdtempSync(join(tmpdir(), "tau-agent-pressure-"));
  const parents = new Map<string, SubagentParent>();
  const pending = new Map<
    string,
    { finish: (outcome: SubagentOutcome) => void; signal: AbortSignal }
  >();
  const started: SubagentRun[] = [];
  const activeAgents = new Set<string>();
  const delivered = new Map<string, number>();
  let running = 0;
  let peak = 0;
  let parentBusy = false;
  const host: SubagentHost = {
    parent: id => {
      const parent = parents.get(id);
      if (!parent) throw new Error("父身份无效");
      return parent;
    },
    execute: vi.fn((_parent, agent, run, signal) => {
      expect(activeAgents.has(agent.agentId)).toBe(false);
      activeAgents.add(agent.agentId);
      started.push(run);
      running += 1;
      peak = Math.max(peak, running);
      return new Promise<SubagentOutcome>(resolve => {
        const finish = (outcome: SubagentOutcome) => {
          if (!pending.delete(run.runId)) return;
          signal.removeEventListener("abort", abort);
          activeAgents.delete(agent.agentId);
          running -= 1;
          resolve(outcome);
        };
        const abort = () => finish({ status: "cancelled" });
        pending.set(run.runId, { finish, signal });
        signal.addEventListener("abort", abort, { once: true });
        if (auto)
          setImmediate(() =>
            finish(
              Number(run.input) % 13 === 0
                ? { status: "failed", error: { message: "Connection reset" } }
                : { status: "completed", result: `完成 ${run.input}` }
            )
          );
      });
    }),
    deliver: vi.fn(async (_parent, messages) => {
      if (parentBusy) return false;
      for (const message of messages)
        delivered.set(message.messageId, (delivered.get(message.messageId) ?? 0) + 1);
      return true;
    }),
    changed: vi.fn(),
  };
  const repository = new SubagentRepository(dir);
  const service = new SubagentService(repository, host, concurrency);
  const addParent = (id: string) => {
    const parent: SubagentParent = {
      key: `library:${id}`,
      hostId: id,
      scope: id,
      databaseName: id,
      cwd: dir,
      branchId: `${id}-branch`,
    };
    parents.set(id, parent);
    return parent;
  };
  const parent = addParent("parent");
  const submit = (id: string, input: string, agentId?: string, parentId = "parent") =>
    service.submit(parentId, id, { agentId, title: id, message: input, mode: "async" });
  cleanups.push(async () => {
    for (const owner of parents.values())
      if (service.parents.has(owner.key)) await service.stopParent(owner.key);
    for (const execution of [...pending.values()]) execution.finish({ status: "cancelled" });
    await tick();
    await tick();
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    dir,
    host,
    service,
    repository,
    parent,
    parents,
    addParent,
    submit,
    pending,
    started,
    delivered,
    busy: (value: boolean) => {
      parentBusy = value;
    },
    peak: () => peak,
  };
}

describe("子 Agent 故障与竞争", () => {
  it("真实文件写入失败时不发布内存候选，原记录仍然可读", () => {
    const h = harness();
    h.repository.update(h.parent.key, state => {
      state.generation = 1;
    });
    const directory = h.repository.directory(h.parent.key);
    const before = readFileSync(join(directory, "state.json"), "utf8");
    mkdirSync(join(directory, "state.json.tmp"));
    expect(() =>
      h.repository.update(h.parent.key, state => {
        state.generation = 2;
      })
    ).toThrow();
    expect(h.repository.read(h.parent.key).generation).toBe(1);
    expect(readFileSync(join(directory, "state.json"), "utf8")).toBe(before);
  });
  it("240 个同时等待混合超时与取消，不会提前自动投递或遗留等待", async () => {
    const h = harness();
    const run = h.submit("wait-storm", "1");
    const waiting = Array.from({ length: 240 }, (_, index) => {
      const controller = new AbortController();
      const promise = h.service
        .wait(run, `wait-${index}`, controller.signal, index % 3 === 0 ? 0 : undefined)
        .then(
          result => result.reason,
          () => "aborted"
        );
      if (index % 3 === 1) controller.abort();
      return promise;
    });
    await tick();
    await new Promise(resolve => setTimeout(resolve, 5));
    h.pending.get(run.runId)!.finish({ status: "completed", result: "完成" });
    const results = await Promise.all(waiting);
    expect(results.filter(result => result === "timeout")).toHaveLength(80);
    expect(results.filter(result => result === "aborted")).toHaveLength(80);
    expect(results.filter(result => result === "terminal")).toHaveLength(80);
    expect(h.delivered.size).toBe(0);
    for (let index = 2; index < 240; index += 3)
      h.service.toolResult(h.parent.key, `wait-${index}`, true);
    await tick();
    expect(h.delivered.size).toBe(0);
    expect(h.service.hasWork(h.parent.key)).toBe(false);
  });

  it("80 个交互会话混合提问和审批，bypass 不自动回答，迟到操作被拒绝", async () => {
    const scope = new PiPermissionScope();
    let mode: "manual" | "bypass" = "manual";
    const controllers = Array.from({ length: 80 }, () => new AbortController());
    const sessions = controllers.map(
      (_, index) =>
        new PiSessionInteractions({
          sessionId: `interaction-${index}`,
          interactive: true,
          tools: [],
          permissionScope: scope,
          getMode: () => mode,
          send: () => undefined,
        })
    );
    cleanups.push(async () => {
      for (const session of sessions) session.dispose();
    });
    const requests = sessions.map((session, index) => {
      const question = session.questions
        .ask(
          `q-${index}`,
          { questions: [{ id: "q", question: "选择？", type: "single", options: ["甲", "乙"] }] },
          controllers[index].signal
        )
        .then(
          () => "answered",
          () => "cancelled"
        );
      const approval = session.permissions.authorize(
        {
          toolCall: { id: `a-${index}`, name: index % 2 ? "write" : "bash", arguments: {} },
          args: {},
        } as Parameters<typeof session.permissions.authorize>[0],
        controllers[index].signal
      );
      const snapshot = session.snapshot();
      return {
        question,
        approval,
        questionId: snapshot.questions[0].requestId,
        approvalId: snapshot.approvals[0].requestId,
      };
    });
    expect(
      new Set(requests.flatMap(request => [request.questionId, request.approvalId])).size
    ).toBe(160);
    sessions[0].permissions.decide(requests[0].approvalId, "allow-session");
    expect(sessions.reduce((sum, session) => sum + session.snapshot().approvals.length, 0)).toBe(
      40
    );
    mode = "bypass";
    for (const session of sessions) session.permissions.modeChanged();
    expect(sessions.reduce((sum, session) => sum + session.snapshot().questions.length, 0)).toBe(
      80
    );
    for (let index = 0; index < sessions.length; index += 1) {
      if (index % 2) controllers[index].abort();
      else
        sessions[index].questions.answer(requests[index].questionId, [
          { questionId: "q", selectedValues: ["甲"], otherText: "" },
        ]);
    }
    const answers = await Promise.all(requests.map(request => request.question));
    await Promise.all(requests.map(request => request.approval));
    expect(answers.filter(answer => answer === "answered")).toHaveLength(40);
    expect(answers.filter(answer => answer === "cancelled")).toHaveLength(40);
    expect(
      sessions.every(
        session => session.snapshot().questions.length + session.snapshot().approvals.length === 0
      )
    ).toBe(true);
    expect(sessions[1].questions.answer(requests[1].questionId, [])).toContain("已结束");
    expect(sessions[1].permissions.decide(requests[1].approvalId, "allow")).toBe(false);
  });
  it("启动队首任务写盘失败后，后面的任务仍能取得执行机会", async () => {
    const h = harness(1);
    const first = h.submit("first", "1");
    const second = h.submit("second", "2");
    vi.spyOn(h.repository, "update").mockImplementationOnce(() => {
      throw new Error("disk full");
    });
    await tick();
    await tick();
    expect(
      h.repository.read(h.parent.key).runs.find(run => run.runId === first.runId)?.status
    ).toBe("failed");
    expect(h.started.some(run => run.runId === second.runId)).toBe(true);
  });
  it("同一执行的第二个等待超时不能释放第一个等待的投递占位", async () => {
    const h = harness();
    const run = h.submit("run", "1");
    const first = h.service.wait(run, "first-wait");
    const second = h.service.wait(run, "second-wait", undefined, 0);
    await tick();
    expect((await second).reason).toBe("timeout");
    h.pending.get(run.runId)!.finish({ status: "completed", result: "完成" });
    await first;
    await tick();
    expect(h.delivered.size).toBe(0);
    h.service.toolResult(h.parent.key, "first-wait", true);
    await tick();
    expect(h.delivered.size).toBe(0);
  });

  it("相同幂等键但不同输入必须拒绝，不能把旧结果冒充新任务", async () => {
    const h = harness();
    const run = h.submit("same", "原任务");
    expect(h.submit("same", "原任务").runId).toBe(run.runId);
    expect(() => h.submit("same", "不同任务")).toThrow();
    await tick();
  });

  it("保存停止代次失败仍必须中止运行任务", async () => {
    const h = harness();
    const run = h.submit("running", "1");
    h.submit("queued", "2", run.agentId);
    await tick();
    const signal = h.pending.get(run.runId)!.signal;
    vi.spyOn(h.repository, "update").mockImplementationOnce(() => {
      throw new Error("disk full");
    });
    await h.service.stopParent(h.parent.key).catch(() => undefined);
    expect(signal.aborted).toBe(true);
    await tick();
    expect(h.repository.read(h.parent.key).runs.every(isSubagentTerminal)).toBe(true);
    expect(h.delivered.size).toBe(0);
  });

  it("取消队列任务时写盘失败不能使任务继续留在可执行队列", async () => {
    const h = harness(1);
    const first = h.submit("running", "1");
    const queued = h.submit("queued", "2");
    await tick();
    vi.spyOn(h.repository, "update").mockImplementationOnce(() => {
      throw new Error("disk full");
    });
    await h.service.cancel(queued).catch(() => undefined);
    expect(
      h.repository.read(h.parent.key).runs.find(run => run.runId === queued.runId)?.status
    ).not.toBe("queued");
    h.pending.get(first.runId)!.finish({ status: "completed", result: "完成" });
    await tick();
    expect(h.started.some(run => run.runId === queued.runId)).toBe(false);
  });

  it("观察者失败不能把已经提交的成功改写为执行失败", async () => {
    const h = harness();
    const run = h.submit("running", "1");
    await tick();
    vi.mocked(h.host.changed).mockImplementationOnce(() => {
      throw new Error("观察端已断开");
    });
    h.pending.get(run.runId)!.finish({ status: "completed", result: "已完成" });
    await tick();
    expect(h.repository.read(h.parent.key).runs[0].outcome).toEqual({
      status: "completed",
      result: "已完成",
    });
    expect(
      h.repository.read(h.parent.key).messages.filter(message => message.runId === run.runId)
    ).toHaveLength(1);
  });

  it("一个父会话的大量排队不能饿死另一个父会话", async () => {
    const h = harness(1);
    for (let index = 0; index < 6; index += 1) h.submit(`a-${index}`, `${index}`);
    h.addParent("other");
    const other = h.submit("other", "99", undefined, "other");
    await tick();
    for (let index = 0; index < 2; index += 1) {
      for (const pending of [...h.pending.values()])
        pending.finish({ status: "completed", result: "完成" });
      await tick();
    }
    expect(h.started.some(run => run.runId === other.runId)).toBe(true);
  });

  it("保留普通对象异常中的实际 message", () => {
    expect(errorMessage({ message: "Connection reset" })).toBe("Connection reset");
    expect(errorMessage({})).toBe("本次执行失败，底层未提供错误详情");
  });

  it("相同 toolCallId 在不同父会话中不能互相确认结果", async () => {
    const h = harness();
    h.addParent("other");
    const first = h.submit("first", "1");
    const second = h.submit("second", "2", undefined, "other");
    const a = h.service.wait(first, "same-call");
    const b = h.service.wait(second, "same-call");
    await tick();
    for (const pending of h.pending.values())
      pending.finish({ status: "completed", result: "完成" });
    await Promise.all([a, b]);
    h.service.toolResult(h.parent.key, "same-call", true);
    expect(h.repository.read(second.origin.parentKey).messages[0].delivered).toBe(false);
    h.service.toolResult(second.origin.parentKey, "same-call", true);
  });

  it("父保持忙碌时合并多条结果，空闲后每条只投递一次", async () => {
    const h = harness(3, true);
    h.busy(true);
    const runs = Array.from({ length: 18 }, (_, index) => h.submit(`run-${index}`, `${index}`));
    await vi.waitFor(() =>
      expect(h.repository.read(h.parent.key).runs.every(isSubagentTerminal)).toBe(true)
    );
    expect(h.delivered.size).toBe(0);
    h.busy(false);
    h.service.scheduleDelivery(h.parent.key);
    await tick();
    await tick();
    expect(h.delivered.size).toBe(runs.length);
    expect([...h.delivered.values()].every(count => count === 1)).toBe(true);
  });
});

describe.runIf(process.env.TAU_SUBAGENT_STRESS === "1")("子 Agent 有界压力", () => {
  it.each([7, 19, 42, 137, 777])(
    "固定种子 %i：200 次提交、取消、停止、等待和完成交错",
    async seed => {
      const h = harness(3);
      h.addParent("second");
      h.addParent("third");
      const ownerIds = ["parent", "second", "third"];
      const agents = new Map<string, string[]>();
      const submitted: SubagentRun[] = [];
      const waits: Promise<unknown>[] = [];
      let random = seed;
      const choose = (size: number) => {
        random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
        return random % size;
      };
      for (let step = 0; step < 200; step += 1) {
        const ownerId = ownerIds[choose(ownerIds.length)];
        const parent = h.parents.get(ownerId)!;
        const kind = choose(10);
        if (kind < 4) {
          const owned = agents.get(ownerId) ?? [];
          const agentId = owned.length && choose(3) ? owned[choose(owned.length)] : undefined;
          const run = h.submit(`${seed}:${step}`, String(step), agentId, ownerId);
          if (!agentId) owned.push(run.agentId);
          agents.set(ownerId, owned);
          submitted.push(run);
        } else if (kind < 6) {
          const pending = [...h.pending.values()];
          if (pending.length)
            pending[choose(pending.length)].finish(
              step % 7
                ? { status: "completed", result: "完成" }
                : { status: "failed", error: { message: "模拟连接中断" } }
            );
        } else if (kind === 6) {
          const runs = h.repository.read(parent.key).runs;
          if (runs.length) await h.service.cancel(runs[choose(runs.length)]);
        } else if (kind === 7) {
          await h.service.stopParent(parent.key);
        } else {
          const runs = h.repository.read(parent.key).runs;
          if (runs.length) {
            const run = runs[choose(runs.length)];
            const controller = new AbortController();
            const toolCallId = `wait:${seed}:${step}`;
            waits.push(
              h.service.wait(run, toolCallId, controller.signal, 0).then(
                result => {
                  if (result.reason === "terminal")
                    h.service.toolResult(parent.key, toolCallId, true);
                },
                () => undefined
              )
            );
            if (kind === 9) controller.abort();
          }
        }
        await tick();
      }
      for (
        let cycle = 0;
        cycle < 200 &&
        [...h.parents.values()].some(parent =>
          h.repository.read(parent.key).runs.some(run => !isSubagentTerminal(run))
        );
        cycle += 1
      ) {
        for (const pending of [...h.pending.values()])
          pending.finish({ status: "completed", result: "收尾" });
        await tick();
      }
      await Promise.all(waits);
      await tick();
      expect(
        [...h.parents.values()].every(parent =>
          h.repository.read(parent.key).runs.every(isSubagentTerminal)
        )
      ).toBe(true);
      expect(new Set(h.started.map(run => run.runId)).size).toBe(h.started.length);
      expect([...h.delivered.values()].every(count => count === 1)).toBe(true);
      expect(h.pending.size).toBe(0);
      expect(h.peak()).toBeLessThanOrEqual(3);
      console.log(
        "SUBAGENT_RACE_STRESS",
        JSON.stringify({
          seed,
          actions: 200,
          submitted: submitted.length,
          executed: h.started.length,
          peak: h.peak(),
        })
      );
    },
    30000
  );
  it("单父会话 400 次复用携带较长输入，测量历史增长后的实际开销", async () => {
    const h = harness(3, true);
    h.busy(true);
    const loop = monitorEventLoopDelay({ resolution: 10 });
    loop.enable();
    const began = performance.now();
    const agents: string[] = [];
    const payload = "上下文材料。".repeat(200);
    for (let index = 0; index < 400; index += 1) {
      const slot = index % 8;
      const run = h.submit(`reuse-${index}`, `${index}:${payload}`, agents[slot]);
      agents[slot] = run.agentId;
      if (index % 20 === 19) await tick();
    }
    const submitMs = performance.now() - began;
    await vi.waitFor(
      () => expect(h.repository.read(h.parent.key).runs.every(isSubagentTerminal)).toBe(true),
      { timeout: 90000, interval: 10 }
    );
    h.busy(false);
    h.service.scheduleDelivery(h.parent.key);
    await vi.waitFor(() => expect(h.delivered.size).toBe(400), { timeout: 10000, interval: 10 });
    loop.disable();
    expect(h.repository.read(h.parent.key).agents).toHaveLength(8);
    expect(new Set(h.started.map(run => run.runId)).size).toBe(400);
    expect([...h.delivered.values()].every(count => count === 1)).toBe(true);
    console.log(
      "SUBAGENT_HISTORY_STRESS",
      JSON.stringify({
        runs: 400,
        agents: 8,
        peak: h.peak(),
        submitMs: Math.round(submitMs),
        elapsedMs: Math.round(performance.now() - began),
        loopMaxMs: Math.round(loop.max / 1e6),
        loopP99Ms: Math.round(loop.percentile(99) / 1e6),
        stateKiB: Math.round(
          statSync(join(h.repository.directory(h.parent.key), "state.json")).size / 1024
        ),
      })
    );
  }, 120000);
  it.each([1, 3, 8])(
    "%i 路并发：480 次执行、多父会话、复用、失败与取消",
    async concurrency => {
      const h = harness(concurrency, true);
      h.busy(true);
      const loop = monitorEventLoopDelay({ resolution: 10 });
      loop.enable();
      await tick();
      const heapStart = process.memoryUsage().heapUsed;
      const began = performance.now();
      const submitted: SubagentRun[] = [];
      for (let parentIndex = 0; parentIndex < 12; parentIndex += 1) {
        const owner = `owner-${parentIndex}`;
        h.addParent(owner);
        for (let agentIndex = 0; agentIndex < 5; agentIndex += 1) {
          let agentId: string | undefined;
          for (let runIndex = 0; runIndex < 8; runIndex += 1) {
            const index = submitted.length;
            const run = h.submit(
              `${owner}:${agentIndex}:${runIndex}`,
              String(index),
              agentId,
              owner
            );
            agentId = run.agentId;
            submitted.push(run);
            if (index % 17 === 0) await h.service.cancel(run);
          }
        }
        await tick();
      }
      const submitMs = performance.now() - began;
      await vi.waitFor(
        () =>
          expect(
            [...h.parents.values()].every(parent =>
              h.repository.read(parent.key).runs.every(isSubagentTerminal)
            )
          ).toBe(true),
        { timeout: 60000, interval: 10 }
      );
      h.busy(false);
      for (const parent of h.parents.values()) h.service.scheduleDelivery(parent.key);
      await vi.waitFor(() => expect(h.delivered.size).toBe(submitted.length), {
        timeout: 60000,
        interval: 10,
      });
      loop.disable();
      expect(h.peak()).toBeLessThanOrEqual(concurrency);
      expect(new Set(h.started.map(run => run.runId)).size).toBe(h.started.length);
      expect([...h.delivered.values()].every(count => count === 1)).toBe(true);
      const statuses: Record<string, number> = {};
      let bytes = 0;
      for (const parent of h.parents.values()) {
        const state = h.repository.read(parent.key);
        if (!state.runs.length) continue;
        for (const agent of state.agents) {
          const expected = state.runs
            .filter(run => run.agentId === agent.agentId && run.status !== "cancelled")
            .map(run => run.runId);
          expect(
            h.started.filter(run => run.agentId === agent.agentId).map(run => run.runId)
          ).toEqual(expected);
        }
        for (const run of state.runs) statuses[run.status] = (statuses[run.status] ?? 0) + 1;
        bytes += statSync(join(h.repository.directory(parent.key), "state.json")).size;
      }
      console.log(
        "SUBAGENT_STRESS",
        JSON.stringify({
          concurrency,
          runs: submitted.length,
          peak: h.peak(),
          submitMs: Math.round(submitMs),
          elapsedMs: Math.round(performance.now() - began),
          loopMaxMs: Math.round(loop.max / 1e6),
          loopP99Ms: Math.round(loop.percentile(99) / 1e6),
          heapDeltaMiB: Math.round((process.memoryUsage().heapUsed - heapStart) / 1048576),
          stateKiB: Math.round(bytes / 1024),
          statuses,
        })
      );
    },
    120000
  );
});
