import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Breadcrumb } from "antd";
import useCalendarStore from "@/stores/useCalendarStore";
import Titlebar from "@/components/Titlebar";
import CalendarHeader from "./components/CalendarHeader";
import CalendarSidebar from "./components/CalendarSidebar";
import CalendarView from "./components/CalendarView";
import EventDialog from "./components/EventDialog";

const CalendarPage = () => {
  const { init } = useCalendarStore();
  const navigate = useNavigate();

  useEffect(() => {
    init();
  }, [init]);

  const breadcrumbItems = [
    { title: "首页", path: "/" },
    { title: "日历", path: "/calendar" },
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-gray-50 dark:bg-[var(--main-bg-color)]">
      <CalendarSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Titlebar className="h-[60px] flex-shrink-0 w-full">
          <div
            className="h-[60px] pl-10 flex items-center"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <Breadcrumb
              items={breadcrumbItems.map((item) => ({
                title: (
                  <span
                    className="cursor-pointer transition-all duration-300 px-2 py-1 rounded hover:bg-[var(--common-hover-bg)]"
                    onClick={() => navigate(item.path)}
                  >
                    {item.title}
                  </span>
                ),
              }))}
            />
          </div>
        </Titlebar>
        <CalendarHeader />
        <CalendarView />
      </div>
      <EventDialog />
    </div>
  );
};

export default CalendarPage;
