export { PLUGIN_SHARED_MODULES } from "./package";
export { readPublishedPluginManifest as validatePluginManifest } from "./rendering";
import {
  evaluatePublishedPluginPackage as evaluate,
  assertRenderTypes as assertTypes,
  PLUGIN_RENDER_VERSION as renderVersion,
} from "./rendering";
import type { PluginDefinition } from "./contract";
import type { PublishedPluginRender } from "./render-artifact";
export const PLUGIN_RENDER_VERSION: 1 = renderVersion;
export type { PublishedPluginRender } from "./render-artifact";

/** 协议层只检查贡献归属，具体扩展类型由模板选用的渲染器解释。 */
export interface EvaluatedPluginDefinition {
  id: string;
  name: string;
  version: string;
  apiVersion: 1;
  editorExtensions?: readonly unknown[];
}
export function evaluatePluginPackage(
  artifact: { manifest: PublishedPluginRender["manifest"]; code: string; css?: string },
  modules: Readonly<Record<string, unknown>>
): EvaluatedPluginDefinition {
  return evaluate(artifact, modules);
}
export function assertRenderTypes(definition: EvaluatedPluginDefinition, types: string[]): void {
  assertTypes(definition as PluginDefinition, types);
}
