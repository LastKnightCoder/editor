import { memo, useMemo, useRef, useEffect } from "react";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import classNames from "classnames";
import useDiaryStore from "@/stores/useDiaryStore";
import { DiaryEntry } from "@/types/diary";
import Editor, { EditorRef } from "@/components/Editor";
import useTheme from "@/hooks/useTheme";
import { getIconPath } from "../../utils/getIconPath";
import {
  getMoodColor,
  getTypeColor,
  hexToRgba,
} from "../../constants/moodConfig";
import { WEATHER_ICONS } from "../../constants/icons";
import styles from "./index.module.less";

dayjs.extend(isoWeek);

const getEntryComparableDate = (entry: DiaryEntry): string => {
  if (entry.type === "daily") {
    return entry.date;
  }

  if (entry.type === "weekly") {
    const [yearStr, weekStr] = entry.date.split("-W");
    return dayjs()
      .year(parseInt(yearStr, 10))
      .isoWeek(parseInt(weekStr, 10))
      .startOf("isoWeek")
      .format("YYYY-MM-DD");
  }

  if (entry.type === "monthly") {
    const [yearStr, monthStr] = entry.date.split("-");
    return dayjs(`${yearStr}-${monthStr}-01`).format("YYYY-MM-DD");
  }

  return entry.date;
};

const TimelineView = memo(() => {
  const {
    currentDate,
    diaryEntries,
    setCurrentDate,
    setCurrentViewMode,
    saveScrollPosition,
    getScrollPosition,
  } = useDiaryStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRefsMap = useRef<Map<string, EditorRef>>(new Map());
  const { isDark } = useTheme();

  const currentDateObj = dayjs(currentDate);
  const year = currentDateObj.year();
  const month = currentDateObj.month() + 1;

  // Get entries for current month
  const monthEntries = useMemo(() => {
    const monthStart = dayjs(`${year}-${String(month).padStart(2, "0")}-01`);
    const monthEnd = monthStart.add(1, "month");
    const startDateKey = monthStart.format("YYYY-MM-DD");
    const endDateKey = monthEnd.format("YYYY-MM-DD");

    const getTypePriority = (type: DiaryEntry["type"]) => {
      if (type === "monthly") return 0;
      if (type === "weekly") return 1;
      return 2;
    };

    return diaryEntries
      .filter((entry) => {
        const comparableDate = getEntryComparableDate(entry);
        return comparableDate >= startDateKey && comparableDate < endDateKey;
      })
      .sort((a, b) => {
        const aDate = getEntryComparableDate(a);
        const bDate = getEntryComparableDate(b);
        const priorityDiff = getTypePriority(a.type) - getTypePriority(b.type);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }
        return bDate.localeCompare(aDate);
      });
  }, [diaryEntries, year, month]);

  // Restore scroll position
  useEffect(() => {
    const savedPosition = getScrollPosition("timeline");
    if (containerRef.current && savedPosition > 0) {
      containerRef.current.scrollTop = savedPosition;
    }
  }, []);

  // Save scroll position on scroll
  const handleScroll = () => {
    if (containerRef.current) {
      saveScrollPosition("timeline", containerRef.current.scrollTop);
    }
  };

  const handleEntryClick = (entry: DiaryEntry) => {
    if (entry.type === "daily") {
      setCurrentDate(entry.date);
      setCurrentViewMode("daily");
    } else if (entry.type === "weekly") {
      const [yearStr, weekStr] = entry.date.split("-W");
      const weekStart = dayjs()
        .year(parseInt(yearStr))
        .isoWeek(parseInt(weekStr))
        .startOf("isoWeek");
      setCurrentDate(weekStart.format("YYYY-MM-DD"));
      setCurrentViewMode("weekly");
    } else if (entry.type === "monthly") {
      const [yearStr, monthStr] = entry.date.split("-");
      const monthStart = dayjs(`${yearStr}-${monthStr}-01`);
      setCurrentDate(monthStart.format("YYYY-MM-DD"));
      setCurrentViewMode("monthly");
    }
  };

  const getDisplayDate = (
    entry: DiaryEntry,
  ): { day: string; weekday: string; month: string } => {
    if (entry.type === "daily") {
      const date = dayjs(entry.date);
      return {
        day: date.format("D"),
        weekday: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][
          date.day()
        ],
        month: date.format("M月"),
      };
    } else if (entry.type === "weekly") {
      const [yearStr, weekStr] = entry.date.split("-W");
      return {
        day: `W${weekStr}`,
        weekday: "周记",
        month: `${yearStr}`,
      };
    } else if (entry.type === "monthly") {
      const [yearStr, monthStr] = entry.date.split("-");
      return {
        day: monthStr,
        weekday: "月记",
        month: `${yearStr}`,
      };
    }
    return { day: "", weekday: "", month: "" };
  };

  if (monthEntries.length === 0) {
    return (
      <div
        className={classNames(styles.emptyState, {
          [styles.dark]: isDark,
        })}
      >
        <p>本月暂无记录</p>
      </div>
    );
  }

  const timelineViewClass = classNames(styles.timelineView, {
    [styles.dark]: isDark,
  });

  return (
    <div
      ref={containerRef}
      className={timelineViewClass}
      onScroll={handleScroll}
    >
      {monthEntries.map((entry, index) => {
        const { day, weekday, month: monthText } = getDisplayDate(entry);

        // Serialize weather and mood to JSON strings for processing
        const weatherStr = entry.weather ? JSON.stringify(entry.weather) : null;
        const moodStr = entry.mood ? JSON.stringify(entry.mood) : null;

        const moodColor = getMoodColor(moodStr);
        const typeColor = getTypeColor(entry.type);
        const weatherIconSrc = getIconPath(weatherStr, "weather");
        const moodIconSrc = getIconPath(moodStr, "mood");

        const isFirstOfDay =
          index === 0 || entry.date !== monthEntries[index - 1].date;

        const baseRingColor = isDark ? "#0F172A" : "#FFFFFF";
        const circleGlowOpacity = isDark ? 0.45 : 0.3;
        const cardBackground = hexToRgba(moodColor, isDark ? 0.15 : 0.08);

        return (
          <div
            key={entry.id}
            className={styles.timelineItem}
            onClick={() => handleEntryClick(entry)}
            style={{
              // @ts-ignore
              "--mood-color": moodColor,
            }}
          >
            {/* Left: Date */}
            {isFirstOfDay && (
              <div className={styles.dateSection}>
                <div className={styles.dateNumber}>{day}</div>
                <div className={styles.weekday}>{weekday}</div>
                <div className={styles.month}>{monthText}</div>
              </div>
            )}
            {!isFirstOfDay && <div className={styles.dateSection} />}

            <div className={styles.circleSection}>
              <div
                className={styles.circle}
                style={{
                  backgroundColor: moodColor,
                  boxShadow: `0 0 0 3px ${baseRingColor}, 0 0 0 5px ${hexToRgba(moodColor, circleGlowOpacity)}`,
                }}
              />
            </div>

            <div className={styles.contentSection}>
              <div
                className={styles.card}
                style={{
                  borderLeftColor: moodColor,
                  backgroundColor: cardBackground,
                }}
              >
                {entry.type !== "daily" && (
                  <div
                    className={styles.typeBadge}
                    style={{ backgroundColor: typeColor }}
                  >
                    {entry.type === "weekly" ? "周记" : "月记"}
                  </div>
                )}

                {(weatherIconSrc || moodIconSrc) && (
                  <div className={styles.meta}>
                    {weatherIconSrc && entry.weather && (
                      <div
                        className={styles.weatherIcon}
                        style={{
                          maskImage: `url(${weatherIconSrc})`,
                          WebkitMaskImage: `url(${weatherIconSrc})`,
                          maskSize: "contain",
                          WebkitMaskSize: "contain",
                          maskRepeat: "no-repeat",
                          WebkitMaskRepeat: "no-repeat",
                          maskPosition: "center",
                          WebkitMaskPosition: "center",
                          backgroundColor:
                            WEATHER_ICONS.find(
                              (icon) => icon.id === entry.weather?.value,
                            )?.color || "#000000",
                        }}
                      />
                    )}
                    {moodIconSrc && (
                      <img
                        src={moodIconSrc}
                        alt="mood"
                        className={styles.icon}
                      />
                    )}
                  </div>
                )}

                <div className={styles.contentPreview}>
                  {entry.content && entry.content.length > 0 ? (
                    <Editor
                      ref={(ref) => {
                        if (ref) {
                          editorRefsMap.current.set(String(entry.id), ref);
                        }
                      }}
                      initValue={entry.content}
                      readonly={true}
                      className="timeline-view-editor"
                    />
                  ) : (
                    <div className={styles.emptyContent}>（空）</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});

export default TimelineView;
