/**
 * 项目详情 page：文档树工作台的承载入口（数据表格与 Vibe Learning 已独立为各自模块）。
 * params 按 id 去重——同一项目重复进入激活同一实例。
 * 工作台本体为 D-033 整体搬迁件（features/projects/components/，换皮与数据收编另立锚点）。
 */

import {
  createPageSchema,
  paramNumber,
  paramOptional,
  paramString,
} from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { ProjectDetailView } from "../views/ProjectDetailView";

const schema = createPageSchema({
  id: paramNumber(),
  // 定位到文档树具体条目（跨项目跳转/新建后定位；同项目内点击走域内 setActiveItemId）
  itemId: paramOptional(paramNumber()),
  at: paramOptional(paramString()),
  // "1"：打开时展开项目回顾（今日页「洞见」卡的「打开回顾」）
  review: paramOptional(paramString()),
  // "compose"：当前文档进创作模式（省略 = 普通详情，口径同 article-detail）
  layout: paramOptional(paramString()),
});

export default definePage({
  key: "project-detail",
  match: "params",
  getId: params => `project-${params.id}`,
  label: "项目详情",
  params: schema.schema,
  component: ProjectDetailView,
});
