/**
 * 日记 page 定义：key "diary" 与 navigation.ts 一致，真实注册接管侧边栏入口
 * （legacy.tsx 的占位同步删除）。全局一份（single）；id = 标签频道（侧栏子项），
 * date = 外部定位到某天，moment = 同时精确到那一条（diary_segments.id）。切频道经栈机原位更新参数，不堆历史。
 */

import { createPageSchema, paramOptional, paramString } from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { DiaryView } from "../views/DiaryView";

const schema = createPageSchema({
  id: paramOptional(paramString()),
  date: paramOptional(paramString()),
  moment: paramOptional(paramString()),
});

export default definePage({
  key: "diary",
  match: "single",
  label: "日记",
  params: schema.schema,
  component: DiaryView,
});
