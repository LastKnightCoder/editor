/**
 * 插件内容的通用只读页：插件停用或已卸载（宽限期内）时，从检索结果、@ 引用打开它的正文。
 */
import { definePage } from "@/page/definePage";
import {
  createPageSchema,
  paramNumber,
  paramOptional,
  paramString,
} from "@/page/core/paramsSchema";
import { PLUGIN_ENTITY_PAGE_KEY } from "@/services/plugin-entity-kinds";
import { PluginEntityView } from "../views/PluginEntityView";

const schema = createPageSchema({
  id: paramNumber(),
  at: paramOptional(paramString()),
});

export default definePage({
  key: PLUGIN_ENTITY_PAGE_KEY,
  match: "params",
  getId: params => `plugin-entity-${params.id}`,
  label: "插件内容",
  params: schema.schema,
  component: PluginEntityView,
});
