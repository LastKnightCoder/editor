/**
 * 应用上下文注册表：feature 在视图挂载时登记「当前详情」提供器（待办详情、日程详情等），
 * get_current_context 工具聚合它们 + 页面栈 + 活跃编辑会话交给 AI。
 * 模式对齐 toolRegistry 的 scoped 注册：渲染进程内存单例，React 外可直接读取。
 */

export interface AppContextSnapshot {
  key: string;
  label: string;
  data: unknown;
}

export interface AppContextProvider {
  label: string;
  /** 返回 JSON-able 快照；null / undefined 表示当前不可用（聚合时省略） */
  provide: () => unknown;
}

const providers = new Map<string, AppContextProvider>();

export function registerAppContextProvider(key: string, provider: AppContextProvider): void {
  providers.set(key, provider);
}

export function unregisterAppContextProvider(key: string): void {
  providers.delete(key);
}

/** 聚合当前全部上下文；单个 provider 抛错只跳过自身，不影响整体 */
export function collectAppContext(): AppContextSnapshot[] {
  const snapshots: AppContextSnapshot[] = [];
  for (const [key, provider] of providers) {
    try {
      const data = provider.provide();
      if (data == null) continue;
      snapshots.push({ key, label: provider.label, data });
    } catch (error) {
      console.warn("[AppContext] provider failed", { key, error });
    }
  }
  return snapshots;
}
