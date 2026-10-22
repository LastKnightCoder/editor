import type { Disposable, JsonValue, PluginPageContext } from "@tau/plugins";
import { copyJson } from "@tau/plugins/host";

interface PageContextBinding {
  params: Readonly<Record<string, unknown>>;
  signal: AbortSignal;
  isAvailable: () => boolean;
  /** 宿主的 Esc 仲裁（D-003）：登记浮层退场回调，返回注销函数 */
  registerOverlayDismiss?: (dismiss: () => void) => () => void;
}

interface Registration {
  provide: () => JsonValue;
  isAvailable: () => boolean;
}

/** 插件登记的一个浮层；页面显示时才挂到宿主的 Esc 仲裁上 */
interface Dismissal {
  dismiss: () => void;
  unregister?: () => void;
}

const registrations = new Map<string, Registration>();
const instanceKey = (params: Readonly<Record<string, unknown>>) =>
  JSON.stringify([params.pluginId, params.pageId, params.instanceId, params.params]);

export function createPluginPageContext(binding: PageContextBinding) {
  const key = instanceKey(binding.params);
  let mounted = false;
  let registration: Registration | undefined;
  const dismissals = new Set<Dismissal>();
  const isAvailable = () => mounted && !binding.signal.aborted && binding.isAvailable();

  const attach = (entry: Dismissal) => {
    if (entry.unregister || !binding.registerOverlayDismiss) return;
    entry.unregister = binding.registerOverlayDismiss(() => {
      try {
        entry.dismiss();
      } catch (error) {
        console.error("插件浮层关闭失败", error);
      }
    });
  };
  const detach = (entry: Dismissal) => {
    entry.unregister?.();
    entry.unregister = undefined;
  };
  const clear = () => {
    if (registration && registrations.get(key) === registration) registrations.delete(key);
    registration = undefined;
  };
  const release = () => {
    clear();
    dismissals.forEach(detach);
    dismissals.clear();
  };
  const disposable = (dispose: () => void): Disposable => ({ dispose });

  const pageContext: PluginPageContext = Object.freeze({
    register(provider: () => JsonValue) {
      if (!isAvailable()) throw new Error("插件页面上下文不可用");
      if (typeof provider !== "function") throw new Error("页面上下文提供器必须是函数");
      if (registrations.has(key)) throw new Error("当前页面已注册上下文提供器");
      const entry = { provide: provider, isAvailable };
      registration = entry;
      registrations.set(key, entry);
      return disposable(() => {
        if (registrations.get(key) === entry) registrations.delete(key);
        if (registration === entry) registration = undefined;
      });
    },
    isActive: isAvailable,
    registerDismiss(dismiss: () => void) {
      if (typeof dismiss !== "function") throw new Error("关闭函数必须是函数");
      if (binding.signal.aborted) return disposable(() => undefined);
      const entry: Dismissal = { dismiss };
      dismissals.add(entry);
      if (isAvailable()) attach(entry);
      return disposable(() => {
        detach(entry);
        dismissals.delete(entry);
      });
    },
  });
  return {
    pageContext,
    /** 页面显示时调用（Activity 可见时的 layout effect），返回隐藏或卸载时的清理 */
    mount() {
      if (binding.signal.aborted) return () => undefined;
      mounted = true;
      binding.signal.addEventListener("abort", release, { once: true });
      dismissals.forEach(attach);
      return () => {
        mounted = false;
        binding.signal.removeEventListener("abort", release);
        clear();
        dismissals.forEach(detach);
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
