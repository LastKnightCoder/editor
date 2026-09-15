/**
 * 今日（首页）surface 定义。
 */

import { defineSurface } from "@/surface/defineSurface";
import { HomeView } from "../views/HomeView";

export default defineSurface({
  key: "home",
  kind: "page",
  match: "single", // 全局一份：从任何地方回到「今日」都是激活同一实例
  label: "今日",
  status: "new",
  params: {},
  component: HomeView,
});
