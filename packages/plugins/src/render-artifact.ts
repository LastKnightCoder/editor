import type { PluginManifest } from "./package";
import type { ReadablePortablePluginManifest } from "./portable";

/** 发布内容只携带插件产物元数据，不依赖编辑器或 UI 类型。 */
export interface PublishedPluginRender {
  runtimeVersion: 1;
  manifest: PluginManifest | ReadablePortablePluginManifest;
  entry: string;
  styles?: string;
  nodeTypes: string[];
}
