/**
 * 插件详情页：按插件 ID 去重，介绍 / 设置 / 更新日志 / 版本由参数切换。
 */

import { createPageSchema, paramOptional, paramString } from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { PLUGIN_DETAIL_KEY } from "@/app/plugins/runtime";
import { PluginDetailView } from "../views/PluginDetailView";

const schema = createPageSchema({
  pluginId: paramString(),
  tab: paramOptional(paramString()),
  section: paramOptional(paramString()),
});

export default definePage({
  key: PLUGIN_DETAIL_KEY,
  match: "params",
  getId: params => `plugin-${params.pluginId}`,
  label: "插件详情",
  params: schema.schema,
  component: PluginDetailView,
});
