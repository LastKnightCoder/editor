import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Breadcrumb, DatePicker, Select } from "antd";
import { useMemoizedFn, useUnmount } from "ahooks";
import classnames from "classnames";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import type { Dayjs } from "dayjs";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import Titlebar from "@/components/Titlebar";
import Editor, { EditorRef } from "@/components/Editor";
import {
  deleteJournal,
  getOrCreateDailyJournal,
  getOrCreateWeeklyJournal,
  getOrCreateMonthlyJournal,
  getOrCreateYearlyJournal,
  getJournalsExistsInRange,
} from "@/commands/journal";
import useUploadResource from "@/hooks/useUploadResource";
import useEditContent from "@/hooks/useEditContent";
import { IJournal } from "@/types";
import useTheme from "@/hooks/useTheme";
import { useWindowFocus } from "@/hooks/useWindowFocus";

import styles from "./index.module.less";
import { LoadingOutlined } from "@ant-design/icons";

// 初始化 dayjs 插件
dayjs.extend(isoWeek);

// 视图类型
type ViewType = "daily" | "weekly" | "monthly" | "yearly";

// 星期几的标签
const weekDayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

// 禁用未来日期的选择器
const disableFutureDate = (current: Dayjs): boolean => {
  return current && current.valueOf() > Date.now();
};

// 获取一系列日期
const getDates = (
  viewType: ViewType,
  current: Dayjs,
  count: number,
): Dayjs[] => {
  const dates: Dayjs[] = [];
  const currentDate = current.clone();

  if (viewType === "daily") {
    // 获取前后各半数的日期，以当前日期为中心
    const halfCount = Math.floor(count / 2);
    const startDate = currentDate.clone().subtract(halfCount, "day");

    for (let i = 0; i < count; i++) {
      const date = startDate.clone().add(i, "day");
      dates.push(date);
    }
  } else if (viewType === "weekly") {
    // 获取前后各半数的周，以当前周为中心
    const halfCount = Math.floor(count / 2);
    const startDate = currentDate.clone().subtract(halfCount, "week").day(0);

    for (let i = 0; i < count; i++) {
      const date = startDate.clone().add(i, "week");
      dates.push(date);
    }
  } else if (viewType === "monthly") {
    // 获取前后各半数的月，以当前月为中心
    const halfCount = Math.floor(count / 2);
    const startDate = currentDate.clone().subtract(halfCount, "month").date(1);

    for (let i = 0; i < count; i++) {
      const date = startDate.clone().add(i, "month");
      dates.push(date);
    }
  } else if (viewType === "yearly") {
    // 获取前后各半数的年，以当前年为中心
    const halfCount = Math.floor(count / 2);
    const startDate = currentDate
      .clone()
      .subtract(halfCount, "year")
      .month(0)
      .date(1);

    for (let i = 0; i < count; i++) {
      const date = startDate.clone().add(i, "year");
      dates.push(date);
    }
  }

  return dates;
};

// 格式化日期显示
const formatDateDisplay = (date: Dayjs, viewType: ViewType): string => {
  if (viewType === "daily") {
    return `${date.date()}`;
  } else if (viewType === "weekly") {
    return `${date.isoWeek()}周`;
  } else if (viewType === "monthly") {
    return `${date.month() + 1}月`;
  } else {
    return `${date.year()}`;
  }
};

const JournalView = () => {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const isWindowFocused = useWindowFocus();
  const [viewType, setViewType] = useState<ViewType>("daily");
  const [currentDateCenter, setCurrentDateCenter] = useState<Dayjs>(dayjs());
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [loading, setLoading] = useState<boolean>(false);
  const [journal, setJournal] = useState<IJournal | null>(null);
  const scrollableRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorRef>(null);
  const uploadResource = useUploadResource();
  const [journalExistsMap, setJournalExistsMap] = useState<
    Record<string, boolean>
  >({});

  // 使用 useEditContent 来管理内容
  const { throttleHandleEditorContentChange, count } = useEditContent(
    journal?.contentId,
    (content) => {
      if (editorRef.current) {
        editorRef.current.setEditorValue(content);
      }
    },
  );

  // 面包屑导航
  const breadcrumbItems = [
    { title: "首页", path: "/" },
    { title: "日志", path: "/journals" },
  ];

  // 创建或获取日志
  const getOrCreateJournal = useMemoizedFn(
    async (date: Dayjs, type: ViewType): Promise<IJournal | null> => {
      setLoading(true);
      try {
        const timestamp = date.valueOf();
        let journalData: IJournal | null = null;

        if (type === "daily") {
          journalData = await getOrCreateDailyJournal(timestamp);
        } else if (type === "weekly") {
          journalData = await getOrCreateWeeklyJournal(timestamp);
        } else if (type === "monthly") {
          journalData = await getOrCreateMonthlyJournal(timestamp);
        } else if (type === "yearly") {
          journalData = await getOrCreateYearlyJournal(timestamp);
        }

        return journalData;
      } catch (error) {
        console.error("创建日志失败:", error);
        return null;
      } finally {
        setLoading(false);
      }
    },
  );

  // 删除空的日志
  const deleteEmptyJournal = useMemoizedFn(
    async (journalToDelete: IJournal) => {
      if (journalToDelete && journalToDelete.count === 0) {
        try {
          await deleteJournal(journalToDelete.id);
        } catch (error) {
          console.error("删除空日志失败:", error);
        }
      }
    },
  );

  // 处理编辑器内容变化
  const handleEditorChange = useMemoizedFn((content) => {
    if (isWindowFocused && editorRef.current?.isFocus()) {
      throttleHandleEditorContentChange(content);
    }
  });

  // 在卸载时保存内容并检查是否需要删除空日志
  useUnmount(async () => {
    throttleHandleEditorContentChange.flush();

    // 检查当前日志是否为空，如果为空则删除
    if (count === 0 && journal) {
      await deleteEmptyJournal(journal as IJournal);
    }
  });

  // 加载选中日期的日志
  const loadSelectedDateJournal = useMemoizedFn(
    async (date: Dayjs, type: ViewType) => {
      // 先刷新之前的更改
      throttleHandleEditorContentChange.flush();

      if (count === 0 && journal) {
        await deleteEmptyJournal(journal as IJournal);
      }

      // 获取新的日志
      const journalData = await getOrCreateJournal(date, type);
      setJournal(journalData);
      // 更新 journalExistsMap
      const dates = getDates(viewType, date, 100);
      fetchJournalExistsStatus(dates);
    },
  );

  // 处理日期选择器变化
  const onDateChange = useMemoizedFn((date: Dayjs | null) => {
    if (!date) return;
    handleDateItemClick(date);
  });

  // 处理视图类型切换
  const handleViewTypeChange = useMemoizedFn((value: ViewType) => {
    setViewType(value);

    // 使用当前选中的日期或今天的日期
    const targetDate = selectedDate.isValid() ? selectedDate : dayjs();
    setSelectedDate(targetDate);
    setCurrentDateCenter(targetDate);

    // 延迟滚动，确保视图已更新
    setTimeout(() => {
      scrollToDate(targetDate);
    }, 50);
  });

  // 点击日期项
  const handleDateItemClick = useMemoizedFn(async (date: Dayjs) => {
    if (
      date.format("YYYY-MM-DD") === selectedDate.format("YYYY-MM-DD") &&
      viewType === "daily"
    ) {
      return;
    }

    setSelectedDate(date);
    scrollToDate(date);
  });

  // 滚动到指定日期
  const scrollToDate = useMemoizedFn((date: Dayjs) => {
    if (!scrollableRef.current || !date.isValid()) return;

    try {
      // 获取所有日期
      const dates = getDates(viewType, currentDateCenter, 100);

      // 找到目标日期的索引
      const dateIndex = dates.findIndex((d) => {
        if (viewType === "daily") {
          return d.format("YYYY-MM-DD") === date.format("YYYY-MM-DD");
        } else if (viewType === "weekly") {
          return d.isoWeek() === date.isoWeek() && d.year() === date.year();
        } else if (viewType === "monthly") {
          return d.month() === date.month() && d.year() === date.year();
        } else {
          return d.year() === date.year();
        }
      });

      if (dateIndex !== -1) {
        // 日期列宽度为50px
        const dateColumnWidth = 50;
        const scrollContainer = scrollableRef.current;
        const containerWidth = scrollContainer.clientWidth;

        // 确保容器宽度有效
        if (containerWidth <= 0) return;

        // 目标滚动位置 = 日期索引 * 列宽 - 容器宽度/2 + 列宽/2
        const targetScrollLeft = Math.max(
          0,
          dateIndex * dateColumnWidth -
            containerWidth / 2 +
            dateColumnWidth / 2,
        );

        // 平滑滚动到目标位置
        scrollContainer.scrollTo({
          left: targetScrollLeft,
          behavior: "smooth",
        });
      } else if (dates.length > 0) {
        // 如果没找到匹配的日期，但需要更新中心日期
        setCurrentDateCenter(date);
      }
    } catch (error) {
      console.error("滚动到日期失败:", error);
    }
  });

  // 在日期选择器变化时滚动到选中日期
  useEffect(() => {
    scrollToDate(selectedDate);
  }, [selectedDate, viewType, scrollToDate]);

  // 前一个周期
  const goToPrevious = useMemoizedFn(() => {
    const prevDate = currentDateCenter
      .clone()
      .subtract(
        1,
        viewType === "daily"
          ? "day"
          : viewType === "weekly"
            ? "week"
            : viewType === "monthly"
              ? "month"
              : "year",
      );
    setCurrentDateCenter(prevDate);
    setSelectedDate(prevDate);
    scrollToDate(prevDate);
  });

  // 后一个周期
  const goToNext = useMemoizedFn(() => {
    const nextDate = currentDateCenter
      .clone()
      .add(
        1,
        viewType === "daily"
          ? "day"
          : viewType === "weekly"
            ? "week"
            : viewType === "monthly"
              ? "month"
              : "year",
      );
    setCurrentDateCenter(nextDate);
    setSelectedDate(nextDate);
    scrollToDate(nextDate);
  });

  // 获取日期范围内的日志存在状态
  const fetchJournalExistsStatus = useMemoizedFn(async (dates: Dayjs[]) => {
    if (!dates.length) return;

    try {
      // 找出最早和最晚的日期
      const validDates = dates.filter((d) => d.isValid());
      if (!validDates.length) return;

      const dateTimestamps = validDates.map((d) => d.valueOf());
      const minTime = Math.min(...dateTimestamps);
      const maxTime = Math.max(...dateTimestamps);

      if (isNaN(minTime) || isNaN(maxTime)) {
        console.error("计算时间戳失败:", dateTimestamps);
        return;
      }

      const existsMap = await getJournalsExistsInRange(
        minTime,
        maxTime,
        viewType,
      );
      setJournalExistsMap(existsMap);
    } catch (error) {
      console.error("获取日志存在状态失败:", error);
      setJournalExistsMap({});
    }
  });

  // 检查指定日期是否有日志
  const hasJournal = (date: Dayjs): boolean => {
    if (!date.isValid()) return false;

    let dateKey = "";

    if (viewType === "daily") {
      dateKey = date.format("YYYY-MM-DD");
    } else if (viewType === "weekly") {
      dateKey = `${date.year()}-W${date.isoWeek()}`;
    } else if (viewType === "monthly") {
      dateKey = date.format("YYYY-MM");
    } else if (viewType === "yearly") {
      dateKey = date.year().toString();
    }

    return !!journalExistsMap[dateKey];
  };

  // 初始化日志
  useEffect(() => {
    loadSelectedDateJournal(selectedDate, viewType);
  }, [selectedDate, viewType, loadSelectedDateJournal]);

  // 当日期范围变化时获取日志存在状态
  useEffect(() => {
    const dates = getDates(
      viewType,
      currentDateCenter,
      viewType === "daily" ? 30 : 12,
    );
    fetchJournalExistsStatus(dates);
  }, [currentDateCenter, viewType, fetchJournalExistsStatus]);

  // 计算是否为当天
  const isToday = (date: Dayjs): boolean => {
    if (viewType === "daily") {
      return date.format("YYYY-MM-DD") === dayjs().format("YYYY-MM-DD");
    } else if (viewType === "weekly") {
      return (
        date.isoWeek() === dayjs().isoWeek() && date.year() === dayjs().year()
      );
    } else if (viewType === "monthly") {
      return date.month() === dayjs().month() && date.year() === dayjs().year();
    } else if (viewType === "yearly") {
      return date.year() === dayjs().year();
    }
    return false;
  };

  return (
    <div className={classnames(styles.container, { [styles.dark]: isDark })}>
      <div className={styles.header}>
        <Titlebar className={styles.titlebar}>
          <Breadcrumb
            className={styles.breadcrumb}
            items={breadcrumbItems.map((item) => ({
              title: (
                <span
                  className={styles.breadcrumbItem}
                  onClick={() => navigate(item.path)}
                >
                  {item.title}
                </span>
              ),
            }))}
          />
        </Titlebar>
      </div>

      <div className={styles.content}>
        <div className={styles.calendarSection}>
          <div className={styles.calendarControls}>
            <div className={styles.navigationControls}>
              <LeftOutlined className={styles.navIcon} onClick={goToPrevious} />
            </div>

            <div className={styles.dateScrollContainer} ref={scrollableRef}>
              <div className={styles.dateRow}>
                {getDates(viewType, currentDateCenter, 100).map(
                  (date, index) => (
                    <div key={`header-${index}`} className={styles.dateColumn}>
                      {viewType === "daily" && (
                        <div className={styles.weekDay}>
                          {weekDayLabels[date.day()]}
                        </div>
                      )}
                      <div
                        className={classnames(styles.dateNumber, {
                          [styles.active]:
                            selectedDate.format("YYYY-MM-DD") ===
                            date.format("YYYY-MM-DD"),
                          [styles.today]: isToday(date),
                          [styles.disabled]: disableFutureDate(date),
                        })}
                        onClick={() =>
                          !disableFutureDate(date) && handleDateItemClick(date)
                        }
                      >
                        {formatDateDisplay(date, viewType)}
                        {hasJournal(date) && (
                          <div className={styles.journalIndicator}></div>
                        )}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>

            <div className={styles.navigationControls}>
              <RightOutlined className={styles.navIcon} onClick={goToNext} />
            </div>

            <div className={styles.viewControls}>
              <Select
                value={viewType}
                onChange={handleViewTypeChange}
                options={[
                  { label: "日", value: "daily" },
                  { label: "周", value: "weekly" },
                  { label: "月", value: "monthly" },
                  { label: "年", value: "yearly" },
                ]}
              />
              <DatePicker
                value={selectedDate}
                onChange={onDateChange}
                disabledDate={disableFutureDate}
                picker={
                  viewType === "daily"
                    ? "date"
                    : viewType === "weekly"
                      ? "week"
                      : viewType === "monthly"
                        ? "month"
                        : "year"
                }
                className={styles.datePicker}
                popupClassName={styles.datePickerPopup}
              />
            </div>
          </div>
        </div>
        {loading ? (
          <div className={styles.loading}>
            <LoadingOutlined spin />
          </div>
        ) : journal ? (
          <div className={styles.editorContainer}>
            <Editor
              key={journal.contentId}
              className={styles.editor}
              ref={editorRef}
              initValue={journal.content}
              onChange={handleEditorChange}
              uploadResource={uploadResource}
              readonly={false}
              placeHolder="请输入日志..."
            />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default JournalView;
