import { useEffect } from "react";
import { useMemoizedFn, useLocalStorageState } from "ahooks";
import useCalendarStore from "@/stores/useCalendarStore";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";
import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import SidebarToggleButton from "@/components/SidebarToggleButton";
import { subscribeCalendarMutationEvent } from "@/mcp/calendar/events";
import CalendarHeader from "./components/CalendarHeader";
import CalendarSidebar from "./components/CalendarSidebar";
import CalendarView from "./components/CalendarView";
import EventDialog from "./components/EventDialog";

const CalendarPage = () => {
  const { init } = useCalendarStore();

  const [hideSidebar, setHideSidebar] = useLocalStorageState(
    "calendar-hide-sidebar",
    {
      defaultValue: false,
    },
  );

  const [sidebarWidth, setSidebarWidth] = useLocalStorageState(
    "calendar-sidebar-width",
    {
      defaultValue: 256,
    },
  );

  const onFoldSidebar = useMemoizedFn(() => {
    setHideSidebar(!hideSidebar);
  });

  // 在数据库连接或切换时自动重新加载日历数据
  useDatabaseChangeEffect(() => {
    init();
  });

  useEffect(() => {
    return subscribeCalendarMutationEvent(() => {
      void init();
    });
  }, [init]);

  return (
    <div className="flex h-full w-full overflow-hidden relative">
      <ResizableAndHideableSidebar
        width={sidebarWidth ?? 256}
        onWidthChange={setSidebarWidth}
        open={!hideSidebar}
        onToggle={onFoldSidebar}
        sidebarPosition="left"
        disableResize={false}
        minWidth={240}
        maxWidth={400}
        className="h-full overflow-hidden"
      >
        <CalendarSidebar />
      </ResizableAndHideableSidebar>
      <SidebarToggleButton.Expand
        isHidden={!!hideSidebar}
        onToggle={onFoldSidebar}
        side="left"
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <CalendarHeader />
        <CalendarView />
      </div>
      <EventDialog />
    </div>
  );
};

export default CalendarPage;
