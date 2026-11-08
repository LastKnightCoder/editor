import { randomUUID } from "node:crypto";
import {
  isSubagentTerminal,
  type SubagentSession,
  type SubagentRun,
  type SubagentOutcome,
  type SubagentParentMessage,
  type SubagentWaitResult,
} from "@/types/subagent";
import { SubagentRepository, type SubagentRecords } from "./repository";
import { errorMessage } from "./state";

const runById = (state: SubagentRecords, runId: string): SubagentRun => {
  const run = state.runs.find(item => item.runId === runId);
  if (!run) throw new Error("子 Agent 执行记录不存在");
  return run;
};

export interface SubagentParent {
  key: string;
  hostId: string;
  scope: string;
  databaseName: string;
  cwd: string;
  branchId: string | null;
  canRunAsync?: boolean;
}

export interface SubagentHost {
  parent(hostId: string): SubagentParent;
  execute(
    parent: SubagentParent,
    agent: SubagentSession,
    run: SubagentRun,
    signal: AbortSignal
  ): Promise<SubagentOutcome>;
  deliver(
    parent: SubagentParent,
    messages: SubagentParentMessage[],
    wake: boolean
  ): Promise<boolean>;
  changed(parent: SubagentParent): void;
}

export class SubagentService {
  readonly parents = new Map<string, SubagentParent>();
  private readonly active = new Map<string, { runId: string; controller: AbortController }>();
  private readonly waiters = new Set<() => void>();
  private readonly waitingTools = new Map<string, Set<string>>();
  private readonly delivering = new Set<string>();
  private readonly deliveryDirty = new Set<string>();
  private readonly scheduled = new Set<string>();
  private drainScheduled = false;
  private running = 0;

  constructor(
    readonly repository: SubagentRepository,
    private readonly host: SubagentHost,
    private readonly maxConcurrency = 3
  ) {}

  attach(hostId: string): SubagentParent {
    const parent = this.host.parent(hostId);
    this.repository.read(parent.key);
    this.parents.set(parent.key, parent);
    this.notifyParent(parent);
    return parent;
  }

  submit(
    hostId: string,
    requestKey: string,
    input: {
      agentId?: string;
      title?: string;
      message: string;
      mode: "sync" | "async";
    }
  ): SubagentRun {
    const parent = this.attach(hostId);
    if (input.mode === "async" && parent.canRunAsync === false) {
      throw new Error("当前父会话是一次性运行，请使用 mode=sync 等待子任务完成");
    }
    const run = this.repository.update(parent.key, state => {
      const existing = state.runs.find(item => item.requestKey === requestKey);
      if (existing) {
        const agent = state.agents.find(item => item.agentId === existing.agentId);
        if (
          existing.input !== input.message ||
          existing.mode !== input.mode ||
          (input.agentId !== undefined && input.agentId !== existing.agentId) ||
          (input.title !== undefined && input.title !== agent?.title)
        ) {
          throw new Error("同一请求身份不能提交不同的子任务");
        }
        return existing;
      }
      let agent = input.agentId
        ? state.agents.find(item => item.agentId === input.agentId)
        : undefined;
      if (input.agentId && !agent) throw new Error("子 Agent 不属于当前父会话");
      if (!agent) {
        agent = {
          agentId: randomUUID(),
          parentKey: parent.key,
          title: input.title || "子 Agent",
          databaseName: parent.databaseName,
          cwd: parent.cwd,
          createdAt: Date.now(),
        };
        state.agents.push(agent);
      }
      const next: SubagentRun = {
        runId: randomUUID(),
        agentId: agent.agentId,
        requestKey,
        input: input.message,
        mode: input.mode,
        origin: {
          parentKey: parent.key,
          branchId: parent.branchId,
          generation: state.generation,
        },
        status: "queued",
        createdAt: Date.now(),
      };
      state.runs.push(next);
      return next;
    });
    this.publish(parent.key);
    this.schedule(parent.key);
    return run;
  }

  resolveRun(hostId: string, agentId: string, runId?: string): SubagentRun {
    const parent = this.attach(hostId);
    const runs = this.repository.read(parent.key).runs.filter(run => run.agentId === agentId);
    const run = runId ? runs.find(item => item.runId === runId) : runs.at(-1);
    if (!run) throw new Error("当前父会话中没有对应的子 Agent 执行");
    return run;
  }

  async wait(
    run: SubagentRun,
    toolCallId: string,
    signal?: AbortSignal,
    timeoutMs?: number
  ): Promise<SubagentWaitResult> {
    signal?.throwIfAborted();
    const tools = this.waitingTools.get(run.runId) ?? new Set<string>();
    tools.add(toolCallId);
    this.waitingTools.set(run.runId, tools);
    const result = await new Promise<SubagentWaitResult>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        this.waiters.delete(check);
        signal?.removeEventListener("abort", abort);
        clearTimeout(timer);
      };
      const abort = () => {
        cleanup();
        reject(new Error("等待已取消"));
      };
      const check = () => {
        const current = runById(this.repository.read(run.origin.parentKey), run.runId);
        if (!isSubagentTerminal(current)) return;
        cleanup();
        if (!current.outcome) {
          reject(new Error("子 Agent 缺少终态结果"));
          return;
        }
        resolve({
          agentId: run.agentId,
          runId: run.runId,
          reason: "terminal",
          outcome: current.outcome,
        });
      };
      this.waiters.add(check);
      signal?.addEventListener("abort", abort, { once: true });
      if (timeoutMs !== undefined)
        timer = setTimeout(() => {
          cleanup();
          resolve({
            agentId: run.agentId,
            runId: run.runId,
            reason: "timeout",
            status: runById(this.repository.read(run.origin.parentKey), run.runId).status,
          });
        }, timeoutMs);
      check();
    }).catch(error => {
      this.releaseWait(run.runId, toolCallId);
      this.scheduleDelivery(run.origin.parentKey);
      throw error;
    });
    if (result.reason === "timeout") {
      this.releaseWait(run.runId, toolCallId);
      this.scheduleDelivery(run.origin.parentKey);
    }
    return result;
  }

  toolResult(parentKey: string, toolCallId: string, delivered: boolean): void {
    const owned = new Set(this.repository.read(parentKey).runs.map(run => run.runId));
    const runs = [...this.waitingTools]
      .filter(([runId, ids]) => owned.has(runId) && ids.has(toolCallId))
      .map(([id]) => id);
    if (!runs.length) return;
    try {
      if (delivered)
        this.repository.update(parentKey, state => {
          for (const message of state.messages)
            if (runs.includes(message.runId) && message.payload.kind === "terminal")
              message.delivered = true;
        });
    } catch (error) {
      console.error("子 Agent 投递回执保存失败:", error);
    }
    for (const runId of runs) this.releaseWait(runId, toolCallId);
    this.scheduleDelivery(parentKey);
  }

  async cancel(run: SubagentRun, interrupted = false): Promise<void> {
    const current = runById(this.repository.read(run.origin.parentKey), run.runId);
    if (isSubagentTerminal(current)) return;
    const active = this.active.get(run.agentId);
    if (active?.runId === run.runId) active.controller.abort();
    try {
      this.finish(
        run,
        interrupted
          ? {
              status: "interrupted",
              error: { message: "执行宿主已关闭，任务未自动恢复" },
            }
          : { status: "cancelled" }
      );
    } catch (error) {
      this.persistenceFailed(run, error);
    }
  }

  async stopParent(parentKey: string, interrupted = false): Promise<void> {
    const generation = this.repository.read(parentKey).generation + 1;
    try {
      this.repository.update(parentKey, state => {
        state.generation = generation;
      });
    } catch (error) {
      this.repository.read(parentKey).generation = generation;
      console.error("子 Agent 停止状态保存失败，仍中止本机执行:", error);
    }
    const pending = this.repository.read(parentKey).runs.filter(run => !isSubagentTerminal(run));
    await Promise.all(pending.map(run => this.cancel(run, interrupted)));
  }

  progress(agent: SubagentSession, text: string, requestKey: string): void {
    const active = this.active.get(agent.agentId);
    const run = this.repository
      .read(agent.parentKey)
      .runs.find(item => item.runId === active?.runId);
    if (!run || isSubagentTerminal(run)) throw new Error("子 Agent 没有活动执行");
    this.repository.update(agent.parentKey, state => {
      const messageId = `progress:${run.runId}:${requestKey}`;
      if (!state.messages.some(item => item.messageId === messageId))
        state.messages.push({
          messageId,
          agentId: agent.agentId,
          runId: run.runId,
          origin: run.origin,
          payload: { kind: "progress", text },
          delivered: false,
        });
    });
    this.scheduleDelivery(agent.parentKey);
  }

  hasWork(parentKey: string): boolean {
    return (
      this.repository.read(parentKey).runs.some(run => !isSubagentTerminal(run)) ||
      this.repository
        .read(parentKey)
        .messages.some(
          message =>
            !message.delivered &&
            message.origin.generation === this.repository.read(parentKey).generation
        )
    );
  }

  scheduleDelivery(parentKey: string): void {
    if (this.delivering.has(parentKey)) {
      this.deliveryDirty.add(parentKey);
      return;
    }
    this.delivering.add(parentKey);
    queueMicrotask(() => {
      void this.deliver(parentKey)
        .catch(error => console.error("子 Agent 消息投递失败:", error))
        .finally(() => {
          this.delivering.delete(parentKey);
          if (this.deliveryDirty.delete(parentKey)) this.scheduleDelivery(parentKey);
        });
    });
  }

  private async deliver(parentKey: string): Promise<void> {
    const parent = this.parents.get(parentKey);
    if (!parent) return;
    const state = this.repository.read(parentKey);
    const messages = state.messages.filter(
      message =>
        !message.delivered &&
        message.origin.generation === state.generation &&
        !this.waitingTools.has(message.runId)
    );
    if (!messages.length) return;
    const wake = messages.some(
      message =>
        message.payload.kind === "terminal" &&
        state.runs.find(run => run.runId === message.runId)?.mode === "async"
    );
    if (!(await this.host.deliver(parent, messages, wake))) return;
    this.repository.update(parentKey, next => {
      for (const message of next.messages)
        if (messages.some(item => item.messageId === message.messageId)) message.delivered = true;
    });
  }

  private schedule(parentKey: string): void {
    this.scheduled.add(parentKey);
    this.requestDrain();
  }

  private requestDrain(): void {
    if (this.drainScheduled) return;
    this.drainScheduled = true;
    setImmediate(() => {
      this.drainScheduled = false;
      this.drain();
    });
  }

  private drain(): void {
    let started = true;
    while (this.running < this.maxConcurrency && started) {
      started = false;
      for (const key of [...this.scheduled]) {
        const parent = this.parents.get(key);
        if (!parent) {
          this.scheduled.delete(key);
          continue;
        }
        if (this.running >= this.maxConcurrency) return;
        const state = this.repository.read(key);
        const run = state.runs.find(
          item => item.status === "queued" && !this.active.has(item.agentId)
        );
        if (!run) {
          if (!state.runs.some(item => item.status === "queued")) this.scheduled.delete(key);
          continue;
        }
        started = true;
        this.scheduled.delete(key);
        this.scheduled.add(key);
        if (run.origin.generation !== state.generation) {
          void this.cancel(run);
          continue;
        }
        const agent = this.repository.read(key).agents.find(item => item.agentId === run.agentId);
        if (!agent) {
          this.persistenceFailed(run, new Error("子会话记录不存在"));
          continue;
        }
        const controller = new AbortController();
        try {
          this.repository.update(key, state => {
            const current = runById(state, run.runId);
            current.status = "running";
            current.startedAt = Date.now();
          });
        } catch (error) {
          this.persistenceFailed(run, error);
          continue;
        }
        this.active.set(agent.agentId, { runId: run.runId, controller });
        this.running += 1;
        started = true;
        this.publish(key);
        void this.execute(parent, agent, run, controller);
      }
    }
  }

  private async execute(
    parent: SubagentParent,
    agent: SubagentSession,
    run: SubagentRun,
    controller: AbortController
  ): Promise<void> {
    try {
      let outcome: SubagentOutcome;
      try {
        outcome = await this.host.execute(parent, agent, run, controller.signal);
      } catch (error) {
        outcome = { status: "failed", error: { message: errorMessage(error) } };
      }
      this.finish(run, controller.signal.aborted ? { status: "cancelled" } : outcome);
    } catch (error) {
      this.persistenceFailed(run, error);
    } finally {
      this.active.delete(agent.agentId);
      this.running -= 1;
      this.requestDrain();
    }
  }

  private persistenceFailed(run: SubagentRun, error: unknown): void {
    // 写盘失败只报告当前进程的故障；重启仍按持久记录标记中断，不重放任务。
    const state = this.repository.read(run.origin.parentKey);
    const current = runById(state, run.runId);
    const outcome: SubagentOutcome = {
      status: "failed",
      error: { message: `执行状态保存失败：${errorMessage(error)}` },
    };
    current.status = "failed";
    current.outcome = outcome;
    current.finishedAt = Date.now();
    state.messages.push({
      messageId: `terminal:${run.runId}`,
      agentId: run.agentId,
      runId: run.runId,
      origin: run.origin,
      payload: { kind: "terminal", outcome },
      delivered: false,
    });
    this.publish(run.origin.parentKey);
    this.scheduleDelivery(run.origin.parentKey);
  }

  private finish(run: SubagentRun, outcome: SubagentOutcome): void {
    const existing = this.repository
      .read(run.origin.parentKey)
      .runs.find(item => item.runId === run.runId);
    if (!existing || isSubagentTerminal(existing)) return;
    this.repository.update(run.origin.parentKey, state => {
      const current = runById(state, run.runId);
      if (isSubagentTerminal(current)) return;
      current.status = outcome.status;
      current.outcome = outcome;
      current.finishedAt = Date.now();
      state.messages.push({
        messageId: `terminal:${run.runId}`,
        agentId: run.agentId,
        runId: run.runId,
        origin: run.origin,
        payload: { kind: "terminal", outcome },
        delivered: false,
      });
    });
    this.publish(run.origin.parentKey);
    this.scheduleDelivery(run.origin.parentKey);
  }

  private publish(parentKey: string): void {
    for (const notify of [...this.waiters]) notify();
    const parent = this.parents.get(parentKey);
    if (parent) this.notifyParent(parent);
  }

  private notifyParent(parent: SubagentParent): void {
    try {
      this.host.changed(parent);
    } catch (error) {
      console.error("子 Agent 状态观察者失败:", error);
    }
  }

  private releaseWait(runId: string, toolCallId: string): void {
    const tools = this.waitingTools.get(runId);
    tools?.delete(toolCallId);
    if (!tools?.size) this.waitingTools.delete(runId);
  }
}
