import { memo, useMemo, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import useDiaryStore, { DiaryViewMode } from "@/stores/useDiaryStore";
import useTabStore from "@/stores/useTabStore";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
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
import { TabType } from "@/types/tab";
dayjs.extend(isoWeek);

// 将日记日期格式转换为标准日期格式 (YYYY-MM-DD)
const convertDiaryDateToStandardDate = (
  date: string,
  viewMode: "daily" | "weekly" | "monthly",
): string => {
  if (viewMode === "daily") {
    // 日记格式: YYYY-MM-DD，直接返回
    return date;
  } else if (viewMode === "weekly") {
    // 周记格式: YYYY-Www (如 2024-W01)，转换为该周的第一天
    const match = date.match(/^(\d{4})-W(\d{2})$/);
    if (match) {
      const year = parseInt(match[1], 10);
      const week = parseInt(match[2], 10);
      // 使用 dayjs 的 isoWeek 插件来获取该周的日期
      // 先创建该年第一周的日期，再调整到目标周
      const firstDayOfYear = dayjs(`${year}-01-04`); // ISO 周的第一周总是包含 1 月 4 日
      const targetDate = firstDayOfYear.isoWeek(week).startOf("isoWeek");
      return targetDate.format("YYYY-MM-DD");
    }
    return date;
  } else if (viewMode === "monthly") {
    // 月记格式: YYYY-MM，转换为该月的第一天
    const match = date.match(/^(\d{4})-(\d{2})$/);
    if (match) {
      return `${match[1]}-${match[2]}-01`;
    }
    return date;
  }
  return date;
};

const DiaryView = memo(() => {
  const {
    currentDate,
    currentViewMode,
    setCurrentViewMode,
    setCurrentDate,
    init,
    getEntriesInDateRange,
  } = useDiaryStore(
    useShallow((state) => ({
      currentDate: state.currentDate,
      currentViewMode: state.currentViewMode,
      setCurrentViewMode: state.setCurrentViewMode,
      setCurrentDate: state.setCurrentDate,
      init: state.init,
      getEntriesInDateRange: state.getEntriesInDateRange,
    })),
  );

  const getActiveTab = useTabStore((state) => state.getActiveTab);
  const isDatabaseConnected = useDatabaseConnected();

  const { borderClass } = useThemeColors();

  // 在数据库连接或切换时加载日记数据
  useDatabaseChangeEffect(() => {
    init();
  });

  // 从 tab params 读取 viewMode 和 date 并设置
  useEffect(() => {
    const activeTab = getActiveTab();
    if (activeTab?.type === TabType.DailyNote && activeTab.params) {
      const params = activeTab.params as {
        viewMode?: "daily" | "weekly" | "monthly";
        date?: string;
      };
      if (params.viewMode && params.viewMode !== currentViewMode) {
        setCurrentViewMode(params.viewMode);
      }
      if (params.date && params.viewMode) {
        // 将日记日期格式转换为标准日期格式
        const standardDate = convertDiaryDateToStandardDate(
          params.date,
          params.viewMode,
        );
        if (standardDate !== currentDate) {
          setCurrentDate(standardDate);
        }
      }
    }
  }, [
    getActiveTab,
    setCurrentViewMode,
    setCurrentDate,
    currentViewMode,
    currentDate,
  ]);

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

  if (!isDatabaseConnected) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
        正在连接数据库...
      </div>
    );
  }

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
          onChange={(value) => setCurrentViewMode(value as DiaryViewMode)}
        />
        <div className="flex-1 overflow-hidden min-w-0 w-full">
          {renderMainContent()}
        </div>
      </div>
    </div>
  );
});

export default DiaryView;
