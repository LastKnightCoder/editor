export { validatePluginManifest, PLUGIN_SHARED_MODULES } from "./package";
import {
  evaluatePluginPackage as evaluate,
  assertRenderTypes as assertTypes,
  PLUGIN_RENDER_VERSION as renderVersion,
} from "./rendering";
import type { PluginDefinition } from "./contract";
import type { DevelopmentPluginPackage } from "./package";
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
  artifact: DevelopmentPluginPackage,
  modules: Readonly<Record<string, unknown>>
): EvaluatedPluginDefinition {
  return evaluate(artifact, modules);
}
export function assertRenderTypes(definition: EvaluatedPluginDefinition, types: string[]): void {
  assertTypes(definition as PluginDefinition, types);
}
