import { useScheduleStore } from "../../uiStore";
import WeekView from "../WeekView";
import MonthView from "../MonthView";
import AgendaView from "../AgendaView";

/** 方案 C 只有月 / 周 / 议程：「日」由右栏当日时间线承担，历史持久化的 day 按月视图渲染 */
const CalendarView = () => {
  const currentView = useScheduleStore(s => s.currentView);

  return (
    <div className="flex-1 overflow-hidden">
      {currentView === "week" && <WeekView />}
      {(currentView === "month" || currentView === "day") && <MonthView />}
      {currentView === "agenda" && <AgendaView />}
    </div>
  );
};

export default CalendarView;
