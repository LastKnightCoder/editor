/**
 * Notebook 详情 page：params 按 id 去重——同一 Notebook 重复进入激活同一实例
 * （对话与生成任务在同一实例内延续，不能被重复挂载打断）。
 */

import { createPageSchema, paramNumber } from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { VibeLearningDetailView } from "../views/VibeLearningDetailView";

const schema = createPageSchema({
  id: paramNumber(),
});

export default definePage({
  key: "vibe-learning-detail",
  match: "params",
  getId: params => `vibe-learning-${params.id}`,
  label: "Notebook 详情",
  params: schema.schema,
  component: VibeLearningDetailView,
});
