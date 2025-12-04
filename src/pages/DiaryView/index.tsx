import { memo, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import useDiaryStore from "@/stores/useDiaryStore";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";
import HeatmapCalendar from "./components/HeatmapCalendar";
import SidebarTimeline from "./components/SidebarTimeline";
import SidebarCalendarEvents from "./components/SidebarCalendarEvents";
import ViewSwitcher from "./components/ViewSwitcher";
import DailyView from "./views/DailyView";
import WeeklyView from "./views/WeeklyView";
import MonthlyView from "./views/MonthlyView";
import TimelineView from "./views/TimelineView";
import useThemeColors from "@/hooks/useThemeColors";
import classnames from "classnames";
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

  const { borderClass } = useThemeColors();

  // 在数据库连接或切换时加载日记数据
  useDatabaseChangeEffect(() => {
    init();
  });

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
    const currentDateObj = dayjs(currentDate);

    switch (currentViewMode) {
      case "daily":
        return <DailyView key={currentDate} />;
      case "weekly": {
        const weekString = `${currentDateObj.isoWeekYear()}-W${String(currentDateObj.isoWeek()).padStart(2, "0")}`;
        return <WeeklyView key={weekString} />;
      }
      case "monthly": {
        const monthString = `${currentDateObj.year()}-${String(currentDateObj.month() + 1).padStart(2, "0")}`;
        return <MonthlyView key={monthString} />;
      }
      case "timeline":
        return <TimelineView />;
      default:
        return <DailyView key={currentDate} />;
    }
  };

  return (
    <div className="relative flex h-full overflow-hidden">
      <div
        className={classnames(
          "w-80 shrink-0 flex flex-col border-r",
          borderClass,
        )}
      >
        <div className="shrink-0">
          <HeatmapCalendar onViewModeChange={setCurrentViewMode} />
        </div>

        {currentViewMode === "daily" ? (
          <div
            className={classnames(
              "flex-1 min-h-0 py-4 border-t flex flex-col",
              borderClass,
            )}
          >
            <div
              className={classnames(
                "px-4 pb-3 text-[13px] font-semibold text-gray-800 dark:text-gray-200 tracking-wide shrink-0",
              )}
            >
              今日日程
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 border-r-10 border-transparent">
              <SidebarCalendarEvents date={currentDate} />
            </div>
          </div>
        ) : sidebarEntries.length > 0 ? (
          <div
            className={classnames("flex-1 min-h-0 py-4 border-t", borderClass)}
          >
            <div
              className={classnames(
                "px-4 pb-3 text-[13px] font-semibold text-gray-800 dark:text-gray-200 tracking-wide shrink-0",
              )}
            >
              {currentViewMode === "weekly" ? "本周日记" : "本月记录"}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 border-r-10 border-transparent">
              <SidebarTimeline entries={sidebarEntries} />
            </div>
          </div>
        ) : null}
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
