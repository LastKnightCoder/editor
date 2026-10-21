import { createContext, useContext, type ReactNode } from "react";
import type { PluginContext } from "@tau/plugins";

const ScopeContext = createContext<PluginContext | null>(null);

/** 插件页面的作用域：正文与引用组件据此确定是哪个插件在使用、按谁的权限放行 */
export function PluginComponentScope({
  context,
  children,
}: {
  context: PluginContext;
  children: ReactNode;
}) {
  return <ScopeContext.Provider value={context}>{children}</ScopeContext.Provider>;
}

export function usePluginComponentScope(): PluginContext | null {
  return useContext(ScopeContext);
}
