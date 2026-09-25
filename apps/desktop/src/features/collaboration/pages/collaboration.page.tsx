/**
 * 协作 page 定义：key "collaboration" 与 navigation.ts 一致，真实注册接管侧边栏入口
 * （legacy.tsx 的占位同步删除）。全局一份（single）；当前内容是可选参数 id，
 * 切换内容经栈机原位更新参数，不堆历史。
 */

import { createPageSchema, paramOptional, paramString } from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { CollaborationView } from "../views/CollaborationView";

const schema = createPageSchema({ id: paramOptional(paramString()) });

export default definePage({
  key: "collaboration",
  match: "single",
  label: "协作",
  status: "new",
  params: schema.schema,
  component: CollaborationView,
});
