import { CalendarDays } from "lucide-react";
import CalendarView from ".";
import OptionsPanel from "./OptionsPanel";
import type { DatabaseViewDefinition } from "../types";
import type { CalendarViewConfig } from "../../types";

/** 日历视图：创建需选定日期列；日期轴自带布局，禁用通用分组 */
export const calendarViewDefinition: DatabaseViewDefinition<CalendarViewConfig> = {
  type: "calendar",
  name: "日历",
  icon: CalendarDays,
  Component: CalendarView,
  requiredColumn: {
    capability: "date",
    unavailableReason: "需要至少一个日期列",
    columnLabel: "日期列",
    columnPlaceholder: "选择用于日历的日期列",
  },
  createOptions: columnId => (columnId ? { dateColumnId: columnId } : undefined),
  OptionsPanel,
  grouping: "none",
};
