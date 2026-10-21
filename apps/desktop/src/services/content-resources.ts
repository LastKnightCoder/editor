import {
  BUILTIN_CONTENT_RESOURCES,
  mergeContentResources,
  type ContentResourceDeclarations,
} from "@tau/db-schema/content-resources";
import { desktopContentPlugins } from "../../shared/content-plugins.ts";

let cached: { plugins: ContentResourceDeclarations; merged: ContentResourceDeclarations } | null =
  null;

/** 内置与已加载内容插件的节点资源声明；内置类型不被插件覆盖 */
export function contentResourceDeclarations(): ContentResourceDeclarations {
  const plugins = desktopContentPlugins.resources;
  if (cached?.plugins !== plugins)
    cached = { plugins, merged: mergeContentResources(plugins, BUILTIN_CONTENT_RESOURCES) };
  return cached.merged;
}
