import { memo, useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import useDiaryStore from "@/stores/useDiaryStore";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useSettingStore from "@/stores/useSettingStore";
import HeatmapCalendar from "./components/HeatmapCalendar";
import SidebarTimeline from "./components/SidebarTimeline";
import ViewSwitcher from "./components/ViewSwitcher";
import DailyView from "./views/DailyView";
import WeeklyView from "./views/WeeklyView";
import MonthlyView from "./views/MonthlyView";
import TimelineView from "./views/TimelineView";

dayjs.extend(isoWeek);

const DiaryView = memo(() => {
  const {
    currentDate,
    currentViewMode,
    setCurrentViewMode,
    init,
    getEntriesInDateRange,
  } = useDiaryStore(
    useShallow((state) => ({
      currentDate: state.currentDate,
      currentViewMode: state.currentViewMode,
      setCurrentViewMode: state.setCurrentViewMode,
      init: state.init,
      getEntriesInDateRange: state.getEntriesInDateRange,
    })),
  );

  const isConnected = useDatabaseConnected();
  const active = useSettingStore((state) => state.setting.database.active);

  useEffect(() => {
    if (isConnected && active) {
      init();
    }
  }, [isConnected, active, init]);

  const sidebarEntries = useMemo(() => {
    const currentDateObj = dayjs(currentDate);

    if (currentViewMode === "weekly") {
      const weekStart = currentDateObj.startOf("isoWeek");
      const weekEnd = currentDateObj.endOf("isoWeek");
      return getEntriesInDateRange(
        weekStart.format("YYYY-MM-DD"),
        weekEnd.format("YYYY-MM-DD"),
      ).filter((entry) => entry.type === "daily");
    } else if (currentViewMode === "monthly") {
      const monthStart = currentDateObj.startOf("month");
      const monthEnd = currentDateObj.endOf("month");
      return getEntriesInDateRange(
        monthStart.format("YYYY-MM-DD"),
        monthEnd.format("YYYY-MM-DD"),
      );
    } else {
      return [];
    }
  }, [currentDate, currentViewMode, getEntriesInDateRange]);

  const viewOptions = [
    { label: "日视图", value: "daily" },
    { label: "周视图", value: "weekly" },
    { label: "月视图", value: "monthly" },
    { label: "时间轴", value: "timeline" },
  ];

  const renderMainContent = () => {
    switch (currentViewMode) {
      case "daily":
        return <DailyView />;
      case "weekly":
        return <WeeklyView />;
      case "monthly":
        return <MonthlyView />;
      case "timeline":
        return <TimelineView />;
      default:
        return <DailyView />;
    }
  };

  return (
    <div className="relative flex h-full overflow-hidden">
      <div className="w-80 shrink-0 flex flex-col border-r border-[#f0f0f0] dark:border-[#2a2a2a] overflow-hidden">
        <div className="shrink-0">
          <HeatmapCalendar onViewModeChange={setCurrentViewMode} />
        </div>

        {sidebarEntries.length > 0 && (
          <div className="flex-1 min-h-0 py-4 border-t border-[#f0f0f0] dark:border-[#2a2a2a] mt-4 flex flex-col">
            <div className="px-4 pb-3 text-[13px] font-semibold text-gray-800 dark:text-gray-200 tracking-wide shrink-0">
              {currentViewMode === "weekly" ? "本周日记" : "本月记录"}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 border-r-10 border-transparent">
              <SidebarTimeline entries={sidebarEntries} />
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
        <ViewSwitcher
          options={viewOptions}
          value={currentViewMode}
          onChange={(value) => setCurrentViewMode(value as any)}
        />
        <div className="flex-1 overflow-hidden min-w-0 w-full">
          {renderMainContent()}
        </div>
      </div>
    </div>
  );
});

export default DiaryView;
