/**
 * 统计页 surface 定义。
 */

import { defineSurface } from "@/surface/defineSurface";
import { StatsView } from "../views/StatsView";

export default defineSurface({
  key: "stats",
  kind: "page",
  match: "single",
  label: "统计",
  status: "new",
  params: {},
  component: StatsView,
});
