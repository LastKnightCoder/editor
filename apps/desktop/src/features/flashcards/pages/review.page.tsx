/**
 * 闪卡复习 page 定义：key "review" 与 navigation.ts 一致，真实注册自动接管侧边栏入口
 * （legacy.tsx 的占位注册同步删除）。
 */

import { definePage } from "@/page/definePage";
import { FlashcardsView } from "../views/FlashcardsView";

export default definePage({
  key: "review",
  match: "single",
  label: "闪卡复习",
  status: "new",
  params: {},
  component: FlashcardsView,
});
