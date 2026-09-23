/**
 * 项目详情 page 定义（占位）：列表页点击 / 新建后跳转的目标。
 * params 按 id 去重——同一项目重复进入激活同一实例。
 * 工作台本体（文档树 / 数据表格 / Vibe Learning 三型）后续迁移，见 DECISIONS.md。
 */

import { createPageSchema, paramNumber } from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { ProjectDetailView } from "../views/ProjectDetailView";

const schema = createPageSchema({ id: paramNumber() });

export default definePage({
  key: "project-detail",
  match: "params",
  getId: params => `project-${params.id}`,
  label: "项目详情",
  status: "new",
  params: schema.schema,
  component: ProjectDetailView,
});
