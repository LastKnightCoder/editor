/**
 * 插件页：发现 / 已安装 / 更新三个标签，标签进入页面参数以便命令面板与设置跳转直达。
 */

import { createPageSchema, paramOptional, paramString } from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { PluginsView } from "../views/PluginsView";

const schema = createPageSchema({ tab: paramOptional(paramString()) });

export default definePage({
  key: "plugins",
  match: "single",
  label: "插件",
  params: schema.schema,
  component: PluginsView,
});
