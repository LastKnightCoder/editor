import type { PluginContext, PluginToolRendererDefinition } from "@tau/plugins";
import type { ChatAdapter } from "@tau/plugins/host";
import { getPluginToolId, getPluginToolName } from "@tau/ai/tool-identity";

/** 保存可用渲染器声明，聊天视图可按模型工具名或历史稳定 ID 取用。 */
export function createMobilePluginChat() {
  const entries = new Map<
    string,
    { context: PluginContext; definition: PluginToolRendererDefinition }
  >();
  const listeners = new Set<() => void>();
  const releases = new Set<() => void>();
  let revision = 0;
  let disposed = false;
  const publish = () => {
    revision++;
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        /* 观察者不影响注册生命周期。 */
      }
    }
  };
  const adapter: ChatAdapter = {
    async prepare(context, definition) {
      const keys = await Promise.all([
        getPluginToolName(context.pluginId, definition.mcpId, definition.toolName),
        getPluginToolId(context.pluginId, definition.mcpId, definition.toolName),
      ]);
      context.signal.throwIfAborted();
      return () => {
        context.signal.throwIfAborted();
        if (disposed) throw new Error("聊天工具渲染器宿主已释放");
        if (keys.some(key => entries.has(key))) throw new Error("聊天工具渲染器已注册");
        const entry = { context, definition: Object.freeze({ ...definition }) };
        for (const key of keys) entries.set(key, entry);
        const dispose = () => {
          releases.delete(dispose);
          context.signal.removeEventListener("abort", dispose);
          let changed = false;
          for (const key of keys)
            if (entries.get(key) === entry) {
              entries.delete(key);
              changed = true;
            }
          if (changed) publish();
        };
        context.signal.addEventListener("abort", dispose, { once: true });
        releases.add(dispose);
        publish();
        return { dispose };
      };
    },
  };
  return {
    adapter,
    resolve(key: string): Readonly<PluginToolRendererDefinition> | undefined {
      const entry = entries.get(key);
      return !disposed && entry && !entry.context.signal.aborted ? entry.definition : undefined;
    },
    getSnapshot: () => revision,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const release of [...releases]) release();
      entries.clear();
      publish();
      listeners.clear();
    },
  };
}
