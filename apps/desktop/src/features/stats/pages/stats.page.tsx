/**
 * 统计页 page 定义。
 */

import { definePage } from "@/page/definePage";
import { StatsView } from "../views/StatsView";

export default definePage({
  key: "stats",
  match: "single",
  label: "统计",
  status: "new",
  params: {},
  component: StatsView,
});
