/**
 * 日程页 page 定义（legacy Calendar 迁入；时间记录不并入，见 docs/redesign/日程页迁移方案）。
 * eventId = 外部定位到某条日程（今日页日程卡等入口），进入后翻到该日程所在日期并打开详情，参数随即消费掉。
 */

import { createPageSchema, paramNumber, paramOptional } from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { ScheduleView } from "../views/ScheduleView";

const schema = createPageSchema({
  eventId: paramOptional(paramNumber()),
});

export default definePage({
  key: "schedule",
  match: "single",
  label: "日程",
  params: schema.schema,
  component: ScheduleView,
});
