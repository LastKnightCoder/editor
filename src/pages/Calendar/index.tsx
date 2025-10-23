import { useEffect } from "react";
import useCalendarStore from "@/stores/useCalendarStore";
import CalendarHeader from "./components/CalendarHeader";
import CalendarSidebar from "./components/CalendarSidebar";
import CalendarView from "./components/CalendarView";
import EventDialog from "./components/EventDialog";

const CalendarPage = () => {
  const { init } = useCalendarStore();

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-gray-50 dark:bg-[var(--main-bg-color)]">
      <CalendarSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <CalendarHeader />
        <CalendarView />
      </div>
      <EventDialog />
    </div>
  );
};

export default CalendarPage;
