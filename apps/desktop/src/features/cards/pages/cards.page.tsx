/**
 * 卡片库 page 定义：key "cards" 与 navigation.ts 一致，真实注册自动接管侧边栏入口。
 * id = 标签筛选（侧栏子项，标签路径，空 = 全部），切换经栈机原位更新参数，不堆历史。
 */

import { createPageSchema, paramOptional, paramString } from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { CardsView } from "../views/CardsView";

const schema = createPageSchema({
  id: paramOptional(paramString()),
});

export default definePage({
  key: "cards",
  match: "single", // 列表页全局一份，重复进入原位激活
  label: "卡片库",
  params: schema.schema,
  component: CardsView,
});
