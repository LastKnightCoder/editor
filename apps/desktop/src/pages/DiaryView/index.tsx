import { memo, useEffect } from "react";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import useDiaryStore from "@/stores/useDiaryStore";
import useTabStore from "@/stores/useTabStore";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import { TabType } from "@/types/tab";
import MomentStreamView from "./views/MomentStreamView";

dayjs.extend(isoWeek);

// 兼容旧格式 YYYY-Www / YYYY-MM，统一转为 YYYY-MM-DD
const convertDiaryDateToStandardDate = (date: string): string => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const weekMatch = date.match(/^(\d{4})-W(\d{2})$/);
  if (weekMatch) {
    const year = parseInt(weekMatch[1], 10);
    const week = parseInt(weekMatch[2], 10);
    return dayjs(`${year}-01-04`)
      .isoWeek(week)
      .startOf("isoWeek")
      .format("YYYY-MM-DD");
  }
  const monthMatch = date.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    return `${monthMatch[1]}-${monthMatch[2]}-01`;
  }
  return date;
};

const DiaryView = memo(() => {
  const {
    init,
    setCurrentDate,
    setActiveDateRange,
    setActiveEntryId,
    setActiveTagFilter,
    setSearchQuery,
  } = useDiaryStore();
  const getActiveTab = useTabStore((state) => state.getActiveTab);
  const isDatabaseConnected = useDatabaseConnected();

  useDatabaseChangeEffect(() => {
    init();
  });

  // Tab 参数同步：收到 date 参数时定位到该日期
  useEffect(() => {
    const activeTab = getActiveTab();
    if (activeTab?.type === TabType.DailyNote && activeTab.params) {
      const params = activeTab.params as { id?: number; date?: string };
      if (params.id != null) {
        setActiveEntryId(params.id);
        setActiveDateRange(null);
        setActiveTagFilter([]);
        setSearchQuery("");
        return;
      }
      if (params.date) {
        const standardDate = convertDiaryDateToStandardDate(params.date);
        setCurrentDate(standardDate);
        const start = dayjs(standardDate).startOf("day").valueOf();
        const end = dayjs(standardDate).endOf("day").valueOf();
        setActiveDateRange([start, end]);
      }
    }
  }, [
    getActiveTab,
    setCurrentDate,
    setActiveDateRange,
    setActiveEntryId,
    setActiveTagFilter,
    setSearchQuery,
  ]);

  if (!isDatabaseConnected) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
        正在连接数据库...
      </div>
    );
  }

  return <MomentStreamView />;
});

DiaryView.displayName = "DiaryView";
export default DiaryView;
