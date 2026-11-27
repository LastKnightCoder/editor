import { appMessages } from "@/app/i18n/messages";
/**
 * 插件内容的通用只读页：插件停用或已卸载且保留数据时，从检索结果、@ 引用打开它的正文。
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
  label: appMessages.ref("page.pluginEntity"),
  params: schema.schema,
  component: PluginEntityView,
});
