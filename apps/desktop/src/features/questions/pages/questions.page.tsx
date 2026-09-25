/**
 * 问题 page 定义：key "questions" 与 navigation.ts 一致，真实注册自动接管侧边栏入口
 * （legacy.tsx 的占位注册同步删除）。selectedId 供首页「探究中的问题」等入口定位到具体问题；
 * id = 分组筛选（侧栏子项，分组 id 字符串，空 = 全部），切换经栈机原位更新参数，不堆历史。
 */

import {
  createPageSchema,
  paramNumber,
  paramOptional,
  paramString,
} from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { QuestionsView } from "../views/QuestionsView";

const schema = createPageSchema({
  id: paramOptional(paramString()),
  selectedId: paramOptional(paramNumber()),
});

export default definePage({
  key: "questions",
  match: "single",
  label: "问题",
  status: "new",
  params: schema.schema,
  component: QuestionsView,
});
