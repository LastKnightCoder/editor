import { randomUUID } from "node:crypto";
import type { BackendStatus } from "@tau/plugins/backend";
import type { PluginManifest } from "@tau/plugins/package";
import {
  assertBackendName,
  backendJson,
  BACKEND_LIMITS,
  type BackendReply,
} from "@tau/plugins/backend-protocol";
import type { JsonValue } from "@tau/plugins";

export interface BackendDescriptor {
  source?: import("./release-guard").BackendCenterSource;
  key: string;
  digest: string;
  manifest: PluginManifest;
  workspaceId: string | null;
  code: string;
  cwd: string;
}
export interface BackendChild {
  readonly pid?: number;
  postMessage(value: unknown): void;
  kill(): boolean;
  on(event: "message", listener: (message: unknown) => void): unknown;
  on(event: "exit", listener: (code: number) => void): unknown;
  on(event: "error", listener: (error: unknown) => void): unknown;
}
interface Call {
  id: string;
  method: string;
  input: JsonValue;
  resolve(value: JsonValue): void;
  reject(error: Error): void;
  cleanup(): void;
  timer: ReturnType<typeof setTimeout>;
}
interface Instance {
  eventWindow: { startedAt: number; count: number };
  tools: Map<string, AbortController>;
  descriptor: BackendDescriptor;
  generation: string;
  status: BackendStatus;
  child?: BackendChild;
  ready: Promise<void>;
  resolveReady(): void;
  rejectReady(error: Error): void;
  calls: Map<string, Call>;
  queue: Call[];
  timers: Set<ReturnType<typeof setTimeout>>;
  lastPong: number;
  stop?: Promise<void>;
  resolveStop?: () => void;
}

export class PluginBackendManager {
  private readonly instances = new Map<string, Instance>();
  private readonly listeners = new Set<(key: string, event: string, value: JsonValue) => void>();
  private readonly statusListeners = new Set<() => void>();
  private closed = false;
  private readonly revisions = new Map<string, number>();
  private readonly pluginRevisions = new Map<string, number>();
  private readonly leases = new Map<string, number>();
  private readonly failures = new Map<string, number[]>();
  private readonly diagnostics = new Map<string, NonNullable<BackendStatus["diagnostics"]>>();

  constructor(
    private readonly options: {
      spawn(descriptor: BackendDescriptor): BackendChild;
      terminate?(child: BackendChild): void;
      authorized(descriptor: BackendDescriptor): Promise<boolean>;
      runTool?(
        descriptor: BackendDescriptor,
        toolId: string,
        args: string[],
        signal: AbortSignal
      ): Promise<import("@tau/plugins/backend").BackendProcessResult>;
      changed?(): void;
      failed?(descriptor: BackendDescriptor): void;
      startupMs?: number;
      requestMs?: number;
      cleanupMs?: number;
      idleMs?: number;
    }
  ) {}

  state(key: string): BackendStatus {
    const diagnostics = this.diagnostics.get(key);
    return {
      ...(this.instances.get(key)?.status ?? { state: "stopped" }),
      ...(diagnostics ? { diagnostics: { ...diagnostics } } : {}),
    };
  }
  resetFailure(key: string) {
    this.failures.delete(key);
  }
  hasWork(pluginId: string): boolean {
    return [...this.instances.values()].some(
      instance =>
        instance.descriptor.manifest.id === pluginId &&
        (instance.calls.size > 0 ||
          instance.queue.length > 0 ||
          instance.tools.size > 0 ||
          (this.leases.get(instance.descriptor.key) ?? 0) > 0)
    );
  }
  list() {
    return [...this.instances.values()].map(instance => ({
      key: instance.descriptor.key,
      pluginId: instance.descriptor.manifest.id,
      workspaceId: instance.descriptor.workspaceId,
      status: this.state(instance.descriptor.key),
    }));
  }
  beginDrain() {
    this.closed = true;
  }
  forceDispose() {
    this.closed = true;
    for (const instance of this.instances.values()) if (instance.child) this.finishStop(instance);
    this.listeners.clear();
  }
  subscribe(listener: (key: string, event: string, value: JsonValue) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  retain(key: string) {
    this.leases.set(key, (this.leases.get(key) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.leases.set(key, Math.max(0, (this.leases.get(key) ?? 0) - 1));
    };
  }
  subscribeStatus(listener: () => void) {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }
  private changed() {
    this.options.changed?.();
    for (const listener of this.statusListeners) {
      try {
        listener();
      } catch {
        /* 观察者不能中断生命周期。 */
      }
    }
  }
  private current(instance: Instance) {
    return this.instances.get(instance.descriptor.key) === instance;
  }

  async start(descriptor: BackendDescriptor): Promise<void> {
    let revision = this.revisions.get(descriptor.key) ?? 0;
    const pluginRevision = this.pluginRevisions.get(descriptor.manifest.id) ?? 0;
    if (this.closed) throw new Error("后台管理器正在退出");
    const recent = (this.failures.get(descriptor.key) ?? []).filter(
      time => Date.now() - time < 300_000
    );
    this.failures.set(descriptor.key, recent);
    if (recent.length >= 3) throw new Error("后台连续失败，请在插件详情页手动重启");
    if (!descriptor.manifest.backend) throw new Error("插件未声明后台");
    if (!(await this.options.authorized(descriptor))) throw new Error("后台尚未获得本机执行授权");
    if (revision !== (this.revisions.get(descriptor.key) ?? 0)) throw new Error("后台启动已撤销");
    if (pluginRevision !== (this.pluginRevisions.get(descriptor.manifest.id) ?? 0))
      throw new Error("插件后台已撤销");
    if (this.closed) throw new Error("后台管理器正在退出");
    const previous = this.instances.get(descriptor.key);
    if (
      previous?.descriptor.digest === descriptor.digest &&
      ["starting", "running"].includes(previous.status.state)
    )
      return previous.ready;
    if (previous?.child) {
      const stopping = this.stop(descriptor.key);
      revision = this.revisions.get(descriptor.key)!;
      await stopping;
      if (revision !== this.revisions.get(descriptor.key)) throw new Error("后台启动已撤销");
    }
    // stop 期间其他调用可能已建立下一代。
    const next = this.instances.get(descriptor.key);
    if (next !== previous && next?.child) return this.start(descriptor);
    if (this.closed) throw new Error("后台管理器正在退出");
    let resolveReady!: () => void;
    let rejectReady!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const generation = randomUUID();
    const previousDiagnostics = this.diagnostics.get(descriptor.key);
    this.diagnostics.set(descriptor.key, {
      startedAt: Date.now(),
      failures: previousDiagnostics?.failures ?? 0,
      timeouts: previousDiagnostics?.timeouts ?? 0,
    });
    const instance: Instance = {
      descriptor,
      generation,
      ready,
      resolveReady,
      rejectReady,
      eventWindow: { startedAt: Date.now(), count: 0 },
      status: { state: "starting", generation },
      calls: new Map(),
      tools: new Map(),
      queue: [],
      timers: new Set(),
      lastPong: Date.now(),
    };
    this.instances.set(descriptor.key, instance);
    this.changed();
    try {
      const child = this.options.spawn(descriptor);
      instance.child = child;
      instance.status.pid = child.pid;
      child.on("message", value => {
        if (!this.current(instance) || !instance.child) return;
        try {
          this.receive(instance, backendJson(value) as BackendReply);
        } catch (error) {
          this.fail(instance, error instanceof Error ? error : new Error("后台协议无效"));
        }
      });
      child.on("exit", code => {
        if (!this.current(instance)) return;
        if (instance.status.state === "draining") this.finishStop(instance);
        else this.fail(instance, new Error(`后台进程已退出（${code}）`));
      });
      child.on("error", () => {
        if (this.current(instance)) this.fail(instance, new Error("后台进程异常"));
      });
      const startup = setTimeout(
        () => this.fail(instance, new Error("后台启动超时")),
        this.options.startupMs ?? BACKEND_LIMITS.startupMs
      );
      instance.timers.add(startup);
      void ready.then(
        () => {
          clearTimeout(startup);
          instance.timers.delete(startup);
        },
        () => undefined
      );
      child.postMessage({
        type: "init",
        generation,
        code: descriptor.code,
        digest: descriptor.manifest.integrity[descriptor.manifest.backend.entry],
        pluginId: descriptor.manifest.id,
        workspaceId: descriptor.workspaceId,
      });
    } catch (error) {
      this.fail(instance, error instanceof Error ? error : new Error("后台启动失败"));
    }
    return ready;
  }

  async call(
    descriptor: BackendDescriptor,
    method: string,
    value: JsonValue,
    signal?: AbortSignal
  ): Promise<JsonValue> {
    assertBackendName(method);
    const input = backendJson(value);
    signal?.throwIfAborted();
    await this.start(descriptor);
    signal?.throwIfAborted();
    const instance = this.instances.get(descriptor.key)!;
    if (
      instance.status.state !== "running" ||
      instance.descriptor.digest !== descriptor.digest ||
      this.closed
    )
      throw new Error("后台运行会话已失效");
    if (instance.queue.length >= BACKEND_LIMITS.queue) throw new Error("后台等待队列已满");
    return new Promise<JsonValue>((resolve, reject) => {
      const id = randomUUID();
      const cancel = () => {
        const queued = instance.queue.indexOf(call);
        if (queued >= 0) instance.queue.splice(queued, 1);
        else if (instance.calls.has(id)) {
          // 取消后仍占用在途槽位，直到子进程确认或超时，防止忽略取消的任务无限增长。
          instance.child?.postMessage({ type: "cancel", generation: instance.generation, id });
        }
        call.cleanup();
        reject(new Error("后台调用已取消"));
        if (queued >= 0) clearTimeout(call.timer);
      };
      const call: Call = {
        id,
        method,
        input,
        resolve,
        reject,
        cleanup: () => signal?.removeEventListener("abort", cancel),
        timer: setTimeout(() => {
          const diagnostics = this.diagnostics.get(descriptor.key);
          if (diagnostics) diagnostics.timeouts++;
          this.fail(instance, new Error("后台调用超时，进程已回收"));
        }, this.options.requestMs ?? BACKEND_LIMITS.requestMs),
      };
      signal?.addEventListener("abort", cancel, { once: true });
      instance.queue.push(call);
      this.dispatch(instance);
    });
  }

  private dispatch(instance: Instance) {
    if (instance.status.state !== "running") return;
    while (
      instance.child &&
      instance.calls.size < BACKEND_LIMITS.concurrent &&
      instance.queue.length
    ) {
      const call = instance.queue.shift()!;
      instance.calls.set(call.id, call);
      try {
        instance.child.postMessage({
          type: "call",
          generation: instance.generation,
          id: call.id,
          method: call.method,
          input: call.input,
        });
      } catch {
        this.fail(instance, new Error("后台消息发送失败"));
        return;
      }
    }
  }

  private receive(instance: Instance, reply: BackendReply) {
    if (!reply || reply.generation !== instance.generation) return;
    if (reply.type === "tool-cancel") {
      instance.tools.get(reply.id)?.abort();
      return;
    }
    if (reply.type === "tool-call" && ["running", "starting"].includes(instance.status.state)) {
      if (
        typeof reply.id !== "string" ||
        reply.id.length > 128 ||
        instance.tools.has(reply.id) ||
        instance.tools.size >= 4
      )
        throw new Error("外部工具请求过多或标识无效");
      const controller = new AbortController();
      instance.tools.set(reply.id, controller);
      void Promise.resolve()
        .then(async () => {
          if (!this.options.runTool) throw new Error("宿主不支持外部工具");
          if (!(await this.options.authorized(instance.descriptor)))
            throw new Error("后台授权已撤销");
          controller.signal.throwIfAborted();
          return this.options.runTool(
            instance.descriptor,
            reply.toolId,
            reply.args,
            controller.signal
          );
        })
        .then(value => {
          if (this.current(instance))
            instance.child?.postMessage({
              type: "tool-result",
              generation: instance.generation,
              id: reply.id,
              value: backendJson(value),
            });
        })
        .catch(error => {
          if (this.current(instance))
            instance.child?.postMessage({
              type: "tool-error",
              generation: instance.generation,
              id: reply.id,
              message: error instanceof Error ? error.message.slice(0, 1000) : "外部工具失败",
            });
        })
        .finally(() => instance.tools.delete(reply.id));
      return;
    }
    if (reply.type === "ready" && instance.status.state === "starting") {
      const diagnostics = this.diagnostics.get(instance.descriptor.key);
      if (diagnostics) diagnostics.startupMs = Date.now() - diagnostics.startedAt;
      instance.status.state = "running";
      instance.resolveReady();
      this.supervise(instance);
      this.changed();
    } else if (reply.type === "pong") instance.lastPong = Date.now();
    else if (reply.type === "stopped" && instance.status.state === "draining")
      this.finishStop(instance);
    else if (reply.type === "event" && instance.status.state === "running") {
      if (Date.now() - instance.eventWindow.startedAt >= 1000)
        instance.eventWindow = { startedAt: Date.now(), count: 0 };
      if (++instance.eventWindow.count > 100) throw new Error("后台事件发送过于频繁");
      assertBackendName(reply.event);
      for (const listener of this.listeners) {
        try {
          listener(instance.descriptor.key, reply.event, backendJson(reply.value));
        } catch {
          /* 单个订阅失败不阻断其他窗口。 */
        }
      }
    } else if (reply.type === "error" && !reply.id) {
      this.fail(
        instance,
        new Error(
          typeof reply.message === "string" ? reply.message.slice(0, 1000) : "后台初始化失败"
        )
      );
    } else if (reply.type === "result" || reply.type === "error") {
      const call = reply.id && instance.calls.get(reply.id);
      if (!call) return;
      instance.calls.delete(call.id);
      clearTimeout(call.timer);
      call.cleanup();
      if (reply.type === "result") call.resolve(backendJson(reply.value));
      else
        call.reject(
          new Error(
            typeof reply.message === "string" ? reply.message.slice(0, 1000) : "后台调用失败"
          )
        );
      this.dispatch(instance);
    }
  }

  private supervise(instance: Instance) {
    let idleSince = Date.now();
    const tick = () => {
      if (!this.current(instance) || instance.status.state !== "running") return;
      if (Date.now() - instance.lastPong > 20_000) {
        this.fail(instance, new Error("后台无响应"));
        return;
      }
      try {
        instance.child?.postMessage({ type: "ping", generation: instance.generation });
      } catch {
        this.fail(instance, new Error("后台连接已断开"));
        return;
      }
      if (
        instance.calls.size ||
        instance.queue.length ||
        instance.tools.size ||
        this.leases.get(instance.descriptor.key)
      )
        idleSince = Date.now();
      if (
        instance.descriptor.manifest.backend?.lifetime === "idle" &&
        Date.now() - idleSince >= (this.options.idleMs ?? BACKEND_LIMITS.idleMs)
      ) {
        void this.stop(instance.descriptor.key);
        return;
      }
      const timer = setTimeout(() => {
        instance.timers.delete(timer);
        tick();
      }, 5_000);
      instance.timers.add(timer);
    };
    tick();
  }

  private rejectCalls(instance: Instance, error: Error) {
    for (const controller of instance.tools.values()) controller.abort();
    instance.tools.clear();
    instance.rejectReady(error);
    for (const call of [...instance.calls.values(), ...instance.queue]) {
      clearTimeout(call.timer);
      call.cleanup();
      call.reject(error);
    }
    instance.calls.clear();
    instance.queue = [];
    for (const timer of instance.timers) clearTimeout(timer);
    instance.timers.clear();
  }
  private fail(instance: Instance, error: Error) {
    if (!this.current(instance) || ["stopped", "failed"].includes(instance.status.state)) return;
    const diagnostics = this.diagnostics.get(instance.descriptor.key);
    if (diagnostics) diagnostics.failures++;
    this.rejectCalls(instance, error);
    const child = instance.child;
    instance.child = undefined;
    instance.status = { state: "failed", generation: instance.generation, error: error.message };
    const failures = (this.failures.get(instance.descriptor.key) ?? []).filter(
      time => Date.now() - time < 300_000
    );
    failures.push(Date.now());
    this.failures.set(instance.descriptor.key, failures);
    if (child) (this.options.terminate ?? (child => child.kill()))(child);
    instance.resolveStop?.();
    this.changed();
    if (!this.closed && failures.length < 3) this.options.failed?.(instance.descriptor);
  }
  private finishStop(instance: Instance) {
    const child = instance.child;
    instance.child = undefined;
    this.rejectCalls(instance, new Error("后台已停止"));
    instance.status = { state: "stopped", generation: instance.generation };
    if (child) (this.options.terminate ?? (child => child.kill()))(child);
    instance.resolveStop?.();
    this.changed();
  }
  stop(key: string): Promise<void> {
    this.revisions.set(key, (this.revisions.get(key) ?? 0) + 1);
    const instance = this.instances.get(key);
    if (!instance?.child) return Promise.resolve();
    if (instance.stop) return instance.stop;
    instance.status.state = "draining";
    this.rejectCalls(instance, new Error("后台正在停止"));
    instance.stop = new Promise(resolve => {
      instance.resolveStop = resolve;
    });
    const timer = setTimeout(
      () => this.finishStop(instance),
      this.options.cleanupMs ?? BACKEND_LIMITS.cleanupMs
    );
    instance.timers.add(timer);
    try {
      instance.child.postMessage({ type: "stop", generation: instance.generation });
    } catch {
      this.finishStop(instance);
    }
    this.changed();
    return instance.stop;
  }
  stopPlugin(pluginId: string) {
    this.pluginRevisions.set(pluginId, (this.pluginRevisions.get(pluginId) ?? 0) + 1);
    return Promise.all(
      [...this.instances.values()]
        .filter(instance => instance.descriptor.manifest.id === pluginId)
        .map(instance => this.stop(instance.descriptor.key))
    );
  }
  async dispose() {
    this.closed = true;
    await Promise.all([...this.instances.keys()].map(key => this.stop(key)));
    this.listeners.clear();
  }
}
