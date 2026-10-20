import type { PluginContext } from "@tau/plugins";
import type { PluginBackendClient, BackendStatus, JsonValue } from "@tau/plugins/backend";
import { on, off } from "@/electron";
import { backendRequest } from "@/commands/plugin-backend";
import { BACKEND_SESSION_INVALID } from "@tau/plugins/backend-protocol";

export function createPluginBackend(context: PluginContext): PluginBackendClient {
  interface Connection {
    promise: Promise<string>;
    invalidated: boolean;
    subscriptions: Map<string, { enabled: boolean; pending: Promise<void> }>;
  }
  let connection: Connection | undefined;
  const listeners = new Map<string, Set<(value: JsonValue) => void>>();
  const invalidate = (current: Connection) => {
    if (current.invalidated) return;
    current.invalidated = true;
    if (connection === current) connection = undefined;
    void current.promise.then(token => backendRequest("disconnect", token)).catch(() => undefined);
  };
  const assertCurrent = (current: Connection) => {
    context.signal.throwIfAborted();
    if (current.invalidated || connection !== current)
      throw new Error(`${BACKEND_SESSION_INVALID}后台连接已失效`);
  };
  const connect = () => {
    context.signal.throwIfAborted();
    if (connection) return connection;
    const current: Connection = {
      invalidated: false,
      subscriptions: new Map(),
      promise: backendRequest<string>("connect", context.pluginId, context.workspaceId)
        .then(token => {
          if (context.signal.aborted || current.invalidated) {
            void backendRequest("disconnect", token).catch(() => undefined);
            assertCurrent(current);
          }
          return token;
        })
        .catch(error => {
          invalidate(current);
          throw error;
        }),
    };
    connection = current;
    return current;
  };
  const send = async <T>(current: Connection, method: string, ...args: unknown[]): Promise<T> => {
    const token = await current.promise;
    assertCurrent(current);
    try {
      const result = await backendRequest<T>(method, token, ...args);
      assertCurrent(current);
      return result;
    } catch (error) {
      if (error instanceof Error && error.message.includes(BACKEND_SESSION_INVALID))
        invalidate(current);
      throw error;
    }
  };
  const synchronizeSubscription = (current: Connection, event: string): Promise<void> => {
    let state = current.subscriptions.get(event);
    if (!state) {
      state = { enabled: false, pending: Promise.resolve() };
      current.subscriptions.set(event, state);
    }
    const subscription = state;
    // 同一事件的订阅与退订按顺序提交，回包期间新增监听也会再次核对期望状态。
    const operation = subscription.pending
      .catch(() => undefined)
      .then(async () => {
        await current.promise;
        assertCurrent(current);
        const enabled = !!listeners.get(event)?.size;
        if (subscription.enabled !== enabled) {
          await send<void>(current, "subscribe", event, enabled);
          subscription.enabled = enabled;
        }
        if (
          !subscription.enabled &&
          !listeners.get(event)?.size &&
          subscription.pending === operation
        )
          current.subscriptions.delete(event);
      });
    subscription.pending = operation;
    return operation;
  };
  const restoreSubscriptions = (current: Connection) =>
    Promise.all([...listeners.keys()].map(event => synchronizeSubscription(current, event)));
  const reportSubscriptionFailure = (error: unknown) =>
    console.error("插件后台订阅失败", error instanceof Error ? error.message : "未知错误");
  const invalidated = (_event: unknown, message: { token: string }) => {
    const current = connection;
    if (!current) return;
    void current.promise
      .then(token => {
        if (token === message.token) invalidate(current);
      })
      .catch(() => undefined);
  };
  const available = (_event: unknown, message: { pluginId: string }) => {
    if (message.pluginId !== context.pluginId || context.signal.aborted) return;
    if (connection) invalidate(connection);
    if (listeners.size) void restoreSubscriptions(connect()).catch(reportSubscriptionFailure);
  };
  const receive = (
    _event: unknown,
    message: { token: string; event: string; value: JsonValue }
  ) => {
    if (!connection || context.signal.aborted) return;
    const current = connection;
    void current.promise
      .then(token => {
        if (
          connection !== current ||
          current.invalidated ||
          token !== message.token ||
          context.signal.aborted
        )
          return;
        for (const listener of listeners.get(message.event) ?? []) {
          try {
            listener(message.value);
          } catch {
            /* 隔离单个插件订阅异常。 */
          }
        }
      })
      .catch(() => undefined);
  };
  on("plugin-backend:event", receive);
  on("plugin-backend:invalidated", invalidated);
  on("plugin-backend:available", available);
  const dispose = () => {
    off("plugin-backend:event", receive);
    off("plugin-backend:invalidated", invalidated);
    off("plugin-backend:available", available);
    listeners.clear();
    const current = connection;
    if (current) {
      invalidate(current);
    }
  };
  context.signal.addEventListener("abort", dispose, { once: true });
  return {
    async call(method, input, options) {
      const signal = options?.signal
        ? AbortSignal.any([context.signal, options.signal])
        : context.signal;
      signal.throwIfAborted();
      const current = connect();
      const token = await current.promise;
      await restoreSubscriptions(current);
      signal.throwIfAborted();
      const requestId = crypto.randomUUID();
      const cancel = () => {
        void backendRequest("cancel", token, requestId).catch(() => undefined);
      };
      signal.addEventListener("abort", cancel, { once: true });
      try {
        const result = await send<JsonValue>(current, "call", requestId, method, input);
        signal.throwIfAborted();
        return result;
      } finally {
        signal.removeEventListener("abort", cancel);
      }
    },
    subscribe(event, listener) {
      context.signal.throwIfAborted();
      let set = listeners.get(event);
      if (!set) listeners.set(event, (set = new Set()));
      set.add(listener);
      let active = true;
      void restoreSubscriptions(connect()).catch(reportSubscriptionFailure);
      return {
        dispose() {
          if (!active) return;
          active = false;
          set!.delete(listener);
          if (!set!.size) {
            listeners.delete(event);
            const current = connection;
            if (current) return synchronizeSubscription(current, event).catch(() => undefined);
          }
        },
      };
    },
    async getState() {
      return send<BackendStatus>(connect(), "state");
    },
  };
}
