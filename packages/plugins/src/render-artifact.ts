import type { PluginManifest } from "./package";
import type { PortablePluginManifest } from "./portable";

/** 发布内容只携带插件产物元数据，不依赖编辑器或 UI 类型。 */
export interface PublishedPluginRender {
  runtimeVersion: 1;
  manifest: PluginManifest | PortablePluginManifest;
  entry: string;
  styles?: string;
  nodeTypes: string[];
}
