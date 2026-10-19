import type { PluginManifest } from "./package";

/** 发布内容只携带插件产物元数据，不依赖编辑器或 UI 类型。 */
export interface PublishedPluginRender {
  runtimeVersion: 1;
  manifest: PluginManifest;
  entry: string;
  styles?: string;
  nodeTypes: string[];
}
