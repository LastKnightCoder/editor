import type { ContentResourceSpec } from "@tau/db-schema/content-resources";
import { invoke } from "@/electron";
import { desktopContentPlugins } from "../../../shared/content-plugins.ts";
import { initializeContentPlugins } from "./content-plugin-bootstrap";

/** 已加载的内容插件把节点资源声明写入当前库，插件不运行时协作上传与 CLI 据此找资源 */
export async function declareContentPluginResources(databaseName: string) {
  await initializeContentPlugins();
  for (const definition of desktopContentPlugins.list()) {
    const resources: Record<string, readonly ContentResourceSpec[]> = {};
    for (const extension of definition.editorExtensions ?? [])
      for (const element of extension.elements ?? [])
        if (element.resources?.length) resources[element.type] = element.resources;
    if (!Object.keys(resources).length) continue;
    await invoke("plugin-element-resources:declare", {
      databaseName,
      pluginId: definition.id,
      resources,
    });
  }
}
