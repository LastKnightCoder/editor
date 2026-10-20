import type { BackendContext, BackendDefinition, BackendDisposable } from "./backend";
import {
  assertBackendName,
  backendJson,
  BACKEND_LIMITS,
  type BackendReply,
  type BackendRequest,
} from "./backend-protocol";
import type { JsonValue } from "./json";

/** 只在插件子进程中创建；协议校验与取消不依赖 Electron。 */
export class BackendRuntime {
  private readonly controller = new AbortController();
  private readonly resources: BackendDisposable[] = [];
  private readonly handlers = new Map<
    string,
    (input: JsonValue, signal: AbortSignal) => Promise<JsonValue>
  >();
  private readonly calls = new Map<string, AbortController>();
  private instance?: ReturnType<BackendDefinition["create"]>;
  private ready = false;
  private stopping?: Promise<void>;

  constructor(
    private readonly identity: { pluginId: string; workspaceId: string | null; generation: string },
    private readonly send: (reply: BackendReply) => void,
    private readonly processTools?: BackendContext["process"]
  ) {}

  async activate(definition: BackendDefinition) {
    if (!definition || typeof definition.create !== "function") throw new Error("后台缺少 create");
    const register = (resource: BackendDisposable) => {
      this.controller.signal.throwIfAborted();
      let pending: Promise<void> | undefined;
      const owned = {
        dispose: () => (pending ??= Promise.resolve().then(() => resource.dispose())),
      };
      this.resources.push(owned);
      return owned;
    };
    const context: BackendContext = {
      process: {
        run: (toolId, args, options) => {
          this.controller.signal.throwIfAborted();
          if (!this.processTools) return Promise.reject(new Error("当前后台不支持外部工具"));
          const signal = options?.signal
            ? AbortSignal.any([options.signal, this.controller.signal])
            : this.controller.signal;
          return this.processTools.run(toolId, args, { signal });
        },
      },
      pluginId: this.identity.pluginId,
      workspaceId: this.identity.workspaceId,
      signal: this.controller.signal,
      register,
      rpc: {
        register: (method, schemas, handler) => {
          assertBackendName(method);
          this.controller.signal.throwIfAborted();
          if (this.handlers.has(method)) throw new Error("后台方法重复");
          if (
            typeof schemas?.input?.parse !== "function" ||
            typeof schemas?.output?.parse !== "function" ||
            typeof handler !== "function"
          )
            throw new Error("后台方法需要输入与输出校验器");
          this.handlers.set(method, async (input, signal) => {
            const parsed = schemas.input.parse(backendJson(input));
            const value = await handler(parsed, { signal });
            signal.throwIfAborted();
            return backendJson(schemas.output.parse(value));
          });
          return register({
            dispose: () => {
              this.handlers.delete(method);
            },
          });
        },
        emit: (event, value) => {
          this.controller.signal.throwIfAborted();
          assertBackendName(event);
          if (this.ready)
            this.reply({
              type: "event",
              event,
              value: backendJson(value),
              generation: this.identity.generation,
            });
        },
      },
    };
    this.instance = definition.create();
    if (typeof this.instance?.activate !== "function") throw new Error("后台缺少 activate");
    await this.instance.activate(context);
    this.controller.signal.throwIfAborted();
    this.ready = true;
    this.reply({ type: "ready", generation: this.identity.generation });
  }

  async receive(value: unknown) {
    const message = backendJson(value) as BackendRequest;
    if (!message || message.generation !== this.identity.generation) return;
    if (message.type === "ping") {
      this.reply({ type: "pong", generation: message.generation });
      return;
    }
    if (message.type === "stop") {
      await this.stop();
      return;
    }
    if (message.type === "cancel") {
      this.calls.get(message.id)?.abort();
      return;
    }
    if (message.type !== "call" || !this.ready || this.controller.signal.aborted) return;
    if (typeof message.id !== "string" || message.id.length > 128 || this.calls.has(message.id))
      throw new Error("后台请求身份无效");
    const controller = new AbortController();
    if (this.calls.size >= BACKEND_LIMITS.concurrent) throw new Error("后台请求过多");
    this.calls.set(message.id, controller);
    try {
      assertBackendName(message.method);
      const handler = this.handlers.get(message.method);
      if (!handler) throw new Error("后台方法不存在");
      const result = await handler(message.input, controller.signal);
      if (!this.controller.signal.aborted)
        this.reply({
          type: "result",
          generation: message.generation,
          id: message.id,
          value: result,
        });
    } catch (error) {
      if (!this.controller.signal.aborted)
        this.reply({
          type: "error",
          generation: message.generation,
          id: message.id,
          message: error instanceof Error ? error.message.slice(0, 1000) : "后台调用失败",
        });
    } finally {
      this.calls.delete(message.id);
    }
  }

  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.ready = false;
    this.controller.abort();
    for (const controller of this.calls.values()) controller.abort();
    this.stopping = (async () => {
      try {
        await this.instance?.deactivate?.();
      } finally {
        for (const resource of this.resources.reverse()) {
          try {
            await resource.dispose();
          } catch {
            /* 继续回收其他资源。 */
          }
        }
        this.handlers.clear();
        this.reply({ type: "stopped", generation: this.identity.generation });
      }
    })();
    return this.stopping;
  }

  private reply(reply: BackendReply) {
    this.send(reply);
  }
}
