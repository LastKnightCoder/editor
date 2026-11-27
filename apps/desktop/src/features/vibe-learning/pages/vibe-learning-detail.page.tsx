import { appMessages } from "@/app/i18n/messages";
/**
 * Notebook 详情 page：params 按 id 去重——同一 Notebook 重复进入激活同一实例
 * （对话与生成任务在同一实例内延续，不能被重复挂载打断）。
 */

import {
  createPageSchema,
  paramNumber,
  paramOptional,
  paramString,
} from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { VibeLearningDetailView } from "../views/VibeLearningDetailView";

const schema = createPageSchema({
  id: paramNumber(),
  chatId: paramOptional(paramString()),
});

export default definePage({
  key: "vibe-learning-detail",
  match: "params",
  getId: params => `vibe-learning-${params.id}`,
  label: appMessages.ref("page.notebookDetail"),
  params: schema.schema,
  component: VibeLearningDetailView,
});
