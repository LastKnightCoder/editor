/**
 * 日程页 page 定义（legacy Calendar 迁入；时间记录不并入，见 docs/redesign/日程页迁移方案）。
 */

import { definePage } from "@/page/definePage";
import { ScheduleView } from "../views/ScheduleView";

export default definePage({
  key: "schedule",
  match: "single",
  label: "日程",
  status: "new",
  params: {},
  component: ScheduleView,
});
