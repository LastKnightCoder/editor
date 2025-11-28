import useCalendarStore from "@/stores/useCalendarStore";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";
import CalendarHeader from "./components/CalendarHeader";
import CalendarSidebar from "./components/CalendarSidebar";
import CalendarView from "./components/CalendarView";
import EventDialog from "./components/EventDialog";

const CalendarPage = () => {
  const { init } = useCalendarStore();

  // 在数据库连接或切换时自动重新加载日历数据
  useDatabaseChangeEffect(() => {
    init();
  });

  return (
    <div className="flex h-full w-full overflow-hidden bg-gray-50 dark:bg-[var(--main-bg-color)]">
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
