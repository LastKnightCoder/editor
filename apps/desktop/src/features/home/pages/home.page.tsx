import { appMessages } from "@/app/i18n/messages";
/**
 * 今日（首页）page 定义。
 */

import { definePage } from "@/page/definePage";
import { HomeView } from "../views/HomeView";

export default definePage({
  key: "home",
  match: "single", // 全局一份：从任何地方回到「今日」都是激活同一实例
  label: appMessages.ref("nav.home"),
  params: {},
  component: HomeView,
});
