import type { ReactNode } from "react";

/** 插件自绘设置的承载卡片：容器归宿主，插件组件只写内容，两端一致 */
export function PluginSettingsCard({ children }: { children: ReactNode }) {
  return <div className="bg-surface text-ink-1 min-w-0 rounded-2xl px-3.5 py-3">{children}</div>;
}
