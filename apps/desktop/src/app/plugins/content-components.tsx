import { lazy, Suspense } from "react";
import {
  configureContentComponents,
  type ContentEditorProps,
  type ContentPreviewProps,
} from "@tau/plugins/components";
import { PluginEntityRef } from "./entity-ref-view";

export { PluginComponentScope, usePluginComponentScope } from "./component-scope";

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
  // 引用只渲染图标与标题，不加载编辑器，直接装配
  EntityRef: props => <PluginEntityRef {...props} />,
});
