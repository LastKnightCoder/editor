/**
 * 白板列表 page 定义：key "whiteboard" 与 navigation.ts 一致，真实注册接管侧边栏入口
 * （legacy.tsx 的占位同步删除）。全局一份（single）；id = 标签范围（侧栏子项），
 * 切换经栈机原位更新参数，不堆历史。
 */

import { createPageSchema, paramOptional, paramString } from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { WhiteboardsView } from "../views/WhiteboardsView";

const schema = createPageSchema({
  id: paramOptional(paramString()),
});

export default definePage({
  key: "whiteboard",
  match: "single",
  label: "白板",
  params: schema.schema,
  component: WhiteboardsView,
});
