/**
 * 项目详情 page：三型工作台（文档树 / 数据表格 / Vibe Learning）的承载入口。
 * params 按 id 去重——同一项目重复进入激活同一实例。
 * 工作台本体为 D-033 整体搬迁件（features/projects/components/，换皮与数据收编另立锚点）。
 */

import { createPageSchema, paramNumber, paramOptional } from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { ProjectDetailView } from "../views/ProjectDetailView";

const schema = createPageSchema({
  id: paramNumber(),
  // 定位到文档树具体条目（跨项目跳转/新建后定位；同项目内点击走域内 setActiveItemId）
  itemId: paramOptional(paramNumber()),
});

export default definePage({
  key: "project-detail",
  match: "params",
  getId: params => `project-${params.id}`,
  label: "项目详情",
  status: "new",
  params: schema.schema,
  component: ProjectDetailView,
});
