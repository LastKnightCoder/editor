/**
 * 微信读书书架 page：key "weread" 与 navigation.ts 一致，真实注册接管侧边栏入口。
 * 分类 / 状态筛选是页内状态，不进参数（切换不堆后退历史）。
 */

import { definePage } from "@/page/definePage";
import { WeReadView } from "../views/WeReadView";

export default definePage({
  key: "weread",
  match: "single",
  label: "微信读书",
  params: {},
  component: WeReadView,
});
