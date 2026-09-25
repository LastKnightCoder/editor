/**
 * 问题 page 定义：key "questions" 与 navigation.ts 一致，真实注册自动接管侧边栏入口
 * （legacy.tsx 的占位注册同步删除）。selectedId 供首页「探究中的问题」等入口定位到具体问题。
 */

import { createPageSchema, paramNumber, paramOptional } from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { QuestionsView } from "../views/QuestionsView";

const schema = createPageSchema({ selectedId: paramOptional(paramNumber()) });

export default definePage({
  key: "questions",
  match: "single",
  label: "问题",
  status: "new",
  params: schema.schema,
  component: QuestionsView,
});
