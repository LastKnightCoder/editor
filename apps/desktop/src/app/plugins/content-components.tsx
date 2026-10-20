import { createContext, lazy, Suspense, useContext, type ReactNode } from "react";
import type { PluginContext } from "@tau/plugins";
import {
  configureContentComponents,
  type ContentEditorProps,
  type ContentPreviewProps,
} from "@tau/plugins/components";

const ScopeContext = createContext<PluginContext | null>(null);

/** 插件页面的作用域：正文组件据此确定是哪个插件在使用、按谁的权限放行 */
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

// 编辑器、协作会话与授权界面较重，首次渲染正文组件时才加载，不拖慢插件宿主启动
const LazyEditor = lazy(() =>
  import("./content-components-view").then(module => ({ default: module.PluginContentEditor }))
);
const LazyPreview = lazy(() =>
  import("./content-components-view").then(module => ({ default: module.PluginContentPreview }))
);

configureContentComponents({
  ContentEditor: (props: ContentEditorProps) => (
    <Suspense fallback={null}>
      <LazyEditor {...props} />
    </Suspense>
  ),
  ContentPreview: (props: ContentPreviewProps) => (
    <Suspense fallback={null}>
      <LazyPreview {...props} />
    </Suspense>
  ),
});
