import type { JsonValue, PluginPageContext } from "@tau/plugins";
import { copyJson } from "@tau/plugins/host";

interface PageContextBinding {
  params: Readonly<Record<string, unknown>>;
  signal: AbortSignal;
  isAvailable: () => boolean;
}

interface Registration {
  provide: () => JsonValue;
  isAvailable: () => boolean;
}

const registrations = new Map<string, Registration>();
const instanceKey = (params: Readonly<Record<string, unknown>>) =>
  JSON.stringify([params.pluginId, params.pageId, params.instanceId, params.params]);

export function createPluginPageContext(binding: PageContextBinding) {
  const key = instanceKey(binding.params);
  let mounted = false;
  let registration: Registration | undefined;
  const clear = () => {
    if (registration && registrations.get(key) === registration) registrations.delete(key);
    registration = undefined;
  };
  const isAvailable = () => mounted && !binding.signal.aborted && binding.isAvailable();
  const pageContext: PluginPageContext = Object.freeze({
    register(provider: () => JsonValue) {
      if (!isAvailable()) throw new Error("插件页面上下文不可用");
      if (typeof provider !== "function") throw new Error("页面上下文提供器必须是函数");
      if (registrations.has(key)) throw new Error("当前页面已注册上下文提供器");
      const entry = { provide: provider, isAvailable };
      registration = entry;
      registrations.set(key, entry);
      return {
        dispose() {
          if (registrations.get(key) === entry) registrations.delete(key);
          if (registration === entry) registration = undefined;
        },
      };
    },
  });
  return {
    pageContext,
    mount() {
      if (binding.signal.aborted) return () => undefined;
      mounted = true;
      binding.signal.addEventListener("abort", clear, { once: true });
      return () => {
        mounted = false;
        binding.signal.removeEventListener("abort", clear);
        clear();
      };
    },
  };
}

export function readPluginPageContext(params: Readonly<Record<string, unknown>>): JsonValue {
  const key = instanceKey(params);
  const entry = registrations.get(key);
  if (!entry) return null;
  try {
    if (!entry.isAvailable()) return null;
    const snapshot = copyJson(entry.provide());
    return registrations.get(key) === entry && entry.isAvailable() ? snapshot : null;
  } catch {
    return null;
  }
}
