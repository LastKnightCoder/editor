import useCalendarStore from "@/stores/useCalendarStore";
import DayView from "../DayView";
import WeekView from "../WeekView";
import MonthView from "../MonthView";
import AgendaView from "../AgendaView";

const CalendarView = () => {
  const { currentView } = useCalendarStore();

  return (
    <div className="flex-1 overflow-hidden">
      {currentView === "day" && <DayView />}
      {currentView === "week" && <WeekView />}
      {currentView === "month" && <MonthView />}
      {currentView === "agenda" && <AgendaView />}
    </div>
  );
};

export default CalendarView;
