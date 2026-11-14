import type {
  JsonValue,
  PluginWindowAppearance,
  PluginWindowCommunication,
  PluginWindowParams,
} from "@tau/plugins";
import { windowStateName } from "../../../shared/plugin-window-values";
import {
  SYSTEM_APPEARANCE,
  WINDOW_PARAMS,
  type AppearancePreference,
  type StateSnapshot,
  type WindowTransport,
} from "../../../shared/plugin-window-protocol";

type Listener = (value: JsonValue | undefined) => void;

interface Subscription {
  latest?: StateSnapshot;
  listeners: Map<Listener, { ready: boolean }>;
  pending: Promise<StateSnapshot>;
}

function notify<T extends unknown[]>(listener: (...args: T) => void, ...args: T) {
  try {
    listener(...args);
  } catch (error) {
    console.error("插件窗口监听器执行失败", error);
  }
}

export function connectWindowCommunication(
  transport: WindowTransport,
  signal: AbortSignal,
  applyAppearance: (value: AppearancePreference) => PluginWindowAppearance,
  applyParams?: (value: StateSnapshot<PluginWindowParams>) => void
) {
  const states = new Map<string, Subscription>();
  const messages = new Map<
    string,
    Set<Parameters<PluginWindowCommunication["messages"]["on"]>[1]>
  >();
  const appearanceListeners = new Set<(value: PluginWindowAppearance) => void>();
  let endpoint: string | undefined;
  let appearance: PluginWindowAppearance | undefined;
  let appearanceRevision = 0;
  let paramsRevision = 0;
  let initialAppearance: AppearancePreference | undefined;

  const token = () => {
    signal.throwIfAborted();
    if (!endpoint) throw new Error("窗口通信尚未连接");
    return endpoint;
  };
  const refreshAppearance = () => {
    if (signal.aborted || !initialAppearance) return;
    const next = applyAppearance(initialAppearance);
    if (JSON.stringify(next) === JSON.stringify(appearance)) return;
    appearance = Object.freeze({ ...next, font: Object.freeze(next.font) });
    for (const listener of appearanceListeners) notify(listener, appearance);
  };
  const receiveAppearance = (snapshot: StateSnapshot<AppearancePreference>) => {
    if (snapshot.value && snapshot.revision > appearanceRevision) {
      appearanceRevision = snapshot.revision;
      initialAppearance = snapshot.value;
      refreshAppearance();
    }
  };
  const receiveParams = (snapshot: StateSnapshot<PluginWindowParams>) => {
    if (snapshot.value && snapshot.revision > paramsRevision) {
      paramsRevision = snapshot.revision;
      applyParams?.(snapshot);
    }
  };

  const pendingEvents: Array<() => void> = [];
  const offState = transport.on("stateChanged", event => {
    const apply = () => {
      if (event.endpoint !== endpoint || signal.aborted) return;
      const { scope, key, snapshot } = event.change;
      if (scope === "app" && key === SYSTEM_APPEARANCE) {
        receiveAppearance(snapshot as StateSnapshot<AppearancePreference>);
      } else if (scope === "instance" && key === WINDOW_PARAMS) {
        receiveParams(snapshot as StateSnapshot<PluginWindowParams>);
      } else if (scope === "plugin") {
        const subscription = states.get(key);
        if (!subscription || snapshot.revision <= (subscription.latest?.revision ?? -1)) return;
        subscription.latest = snapshot;
        for (const [listener, entry] of subscription.listeners)
          if (entry.ready) notify(listener, structuredClone(snapshot.value));
      }
    };
    if (endpoint) apply();
    else pendingEvents.push(apply);
  });
  const offMessage = transport.on("message", event => {
    if (event.endpoint !== endpoint || signal.aborted) return;
    for (const listener of messages.get(event.name) ?? [])
      notify(listener, structuredClone(event.payload), event.sender);
  });
  const stop = () => {
    offState();
    offMessage();
    pendingEvents.length = 0;
    states.clear();
    messages.clear();
    appearanceListeners.clear();
    if (endpoint) void transport.invoke("detachEndpoint", { endpoint }).catch(() => undefined);
  };
  signal.addEventListener("abort", stop, { once: true });

  const systemKey = (key: string) => {
    if (key !== SYSTEM_APPEARANCE) throw new Error("系统窗口状态名称无效");
    token();
  };
  const communication: PluginWindowCommunication = {
    system: {
      get(key) {
        systemKey(key);
        if (!appearance) throw new Error("窗口外观尚未就绪");
        return appearance;
      },
      subscribe(key, callback) {
        systemKey(key);
        const listener = (value: PluginWindowAppearance) => callback(value);
        appearanceListeners.add(listener);
        return {
          dispose: () => {
            appearanceListeners.delete(listener);
          },
        };
      },
    },
    state: {
      async get(key) {
        const result = await transport.invoke("getState", { endpoint: token(), key });
        signal.throwIfAborted();
        return result.value;
      },
      async set(key, value) {
        await transport.invoke("setState", { endpoint: token(), key, value });
        signal.throwIfAborted();
      },
      async subscribe(key, callback) {
        const owner = token();
        let entry = states.get(key);
        if (!entry) {
          entry = {
            listeners: new Map(),
            pending: transport.invoke("subscribeState", { endpoint: owner, key }),
          };
          states.set(key, entry);
        }
        const subscription = entry;
        const listener = (value: JsonValue | undefined) => callback(value);
        const local = { ready: false };
        subscription.listeners.set(listener, local);
        try {
          const initial = await subscription.pending;
          signal.throwIfAborted();
          if (!subscription.latest || initial.revision > subscription.latest.revision)
            subscription.latest = initial;
          local.ready = true;
          notify(listener, structuredClone(subscription.latest.value));
        } catch (error) {
          subscription.listeners.delete(listener);
          if (states.get(key) === subscription && !subscription.listeners.size) states.delete(key);
          throw error;
        }
        return {
          async dispose() {
            subscription.listeners.delete(listener);
            if (states.get(key) !== subscription || subscription.listeners.size) return;
            states.delete(key);
            if (!signal.aborted)
              await transport.invoke("unsubscribeState", { endpoint: owner, key });
          },
        };
      },
    },
    messages: {
      async send(name, payload, target) {
        const delivered = await transport.invoke("sendMessage", {
          endpoint: token(),
          name,
          payload,
          target,
        });
        signal.throwIfAborted();
        return delivered;
      },
      on(name, callback) {
        token();
        windowStateName(name);
        const listener: typeof callback = (...args) => callback(...args);
        const listeners = messages.get(name) ?? new Set<typeof listener>();
        messages.set(name, listeners);
        listeners.add(listener);
        return {
          dispose() {
            listeners.delete(listener);
            if (!listeners.size) messages.delete(name);
          },
        };
      },
    },
  };
  return {
    communication,
    refreshAppearance,
    receiveParams,
    bind(id: string, initial: StateSnapshot<AppearancePreference>) {
      if (signal.aborted) {
        void transport.invoke("detachEndpoint", { endpoint: id }).catch(() => undefined);
        signal.throwIfAborted();
      }
      endpoint = id;
      for (const apply of pendingEvents.splice(0)) apply();
      receiveAppearance(initial);
    },
  };
}
