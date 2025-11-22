import { memo, useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import classNames from "classnames";
import useDiaryStore from "@/stores/useDiaryStore";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useSettingStore from "@/stores/useSettingStore";
import useTheme from "@/hooks/useTheme";
import HeatmapCalendar from "./components/HeatmapCalendar";
import SidebarTimeline from "./components/SidebarTimeline";
import ViewSwitcher from "./components/ViewSwitcher";
import DailyView from "./views/DailyView";
import WeeklyView from "./views/WeeklyView";
import MonthlyView from "./views/MonthlyView";
import TimelineView from "./views/TimelineView";
import styles from "./index.module.less";

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
  const { isDark } = useTheme();

  useEffect(() => {
    if (isConnected && active) {
      init();
    }
  }, [isConnected, active, init]);

  // Get sidebar timeline entries based on current view
  const sidebarEntries = useMemo(() => {
    const currentDateObj = dayjs(currentDate);

    if (currentViewMode === "weekly") {
      // Show entries for current week
      const weekStart = currentDateObj.startOf("isoWeek");
      const weekEnd = currentDateObj.endOf("isoWeek");
      return getEntriesInDateRange(
        weekStart.format("YYYY-MM-DD"),
        weekEnd.format("YYYY-MM-DD"),
      ).filter((entry) => entry.type === "daily");
    } else if (currentViewMode === "monthly") {
      // Show entries for current month
      const monthStart = currentDateObj.startOf("month");
      const monthEnd = currentDateObj.endOf("month");
      return getEntriesInDateRange(
        monthStart.format("YYYY-MM-DD"),
        monthEnd.format("YYYY-MM-DD"),
      );
    } else {
      // For daily and timeline views, don't show sidebar timeline
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

  const diaryViewClass = classNames(styles.diaryView, {
    [styles.dark]: isDark,
  });

  return (
    <div className={diaryViewClass}>
      <div className={styles.sidebar}>
        <div className={styles.calendarSection}>
          <HeatmapCalendar onViewModeChange={setCurrentViewMode} />
        </div>

        {sidebarEntries.length > 0 && (
          <div className={styles.timelineSection}>
            <div className={styles.timelineTitle}>
              {currentViewMode === "weekly" ? "本周日记" : "本月记录"}
            </div>
            <div className={styles.timelineContent}>
              <SidebarTimeline entries={sidebarEntries} />
            </div>
          </div>
        )}
      </div>

      <div className={styles.mainWorkspace}>
        <ViewSwitcher
          options={viewOptions}
          value={currentViewMode}
          onChange={(value) => setCurrentViewMode(value as any)}
        />
        <div className={styles.contentViewport}>{renderMainContent()}</div>
      </div>
    </div>
  );
});

export default DiaryView;
