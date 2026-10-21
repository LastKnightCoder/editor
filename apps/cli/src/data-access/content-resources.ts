import {
  assertContentResourceSpecs,
  BUILTIN_CONTENT_RESOURCES,
  mergeContentResources,
  type ContentResourceDeclarations,
  type ContentResourceSpec,
} from "@tau/db-schema/content-resources";
import { getActiveDbName } from "../utils/path.js";
import { getDataAccess } from "./index.js";

/** 内置与当前库保存的插件节点资源声明；库不可读时只用内置声明 */
export function loadContentResources(): ContentResourceDeclarations {
  const plugins: Record<string, readonly ContentResourceSpec[]> = {};
  try {
    const rows = getDataAccess(getActiveDbName()).query<{ type: string; resources: string }>(
      "SELECT type, resources FROM plugin_element_resources"
    );
    for (const row of rows) {
      try {
        const specs: unknown = JSON.parse(row.resources);
        assertContentResourceSpecs(specs);
        plugins[row.type] = specs;
      } catch {
        // 跳过损坏的声明
      }
    }
  } catch {
    // 没有库或表时只按内置声明显示
  }
  return mergeContentResources(plugins, BUILTIN_CONTENT_RESOURCES);
}
