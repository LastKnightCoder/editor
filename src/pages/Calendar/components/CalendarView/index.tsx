import useCalendarStore from "@/stores/useCalendarStore";
import DayView from "../DayView";
import WeekView from "../WeekView";
import MonthView from "../MonthView";

const CalendarView = () => {
  const { currentView } = useCalendarStore();

  return (
    <div className="flex-1 overflow-hidden">
      {currentView === "day" && <DayView />}
      {currentView === "week" && <WeekView />}
      {currentView === "month" && <MonthView />}
    </div>
  );
};

export default CalendarView;
