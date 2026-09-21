/**
 * 卡片库 page 定义：key "cards" 与 navigation.ts 一致，真实注册自动接管侧边栏入口。
 */

import { definePage } from "@/page/definePage";
import { CardsView } from "../views/CardsView";

export default definePage({
  key: "cards",
  match: "single", // 列表页全局一份，重复进入原位激活
  label: "卡片库",
  status: "new",
  params: {},
  component: CardsView,
});
