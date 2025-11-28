import { memo, useMemo, useRef, useEffect } from "react";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import useDiaryStore from "@/stores/useDiaryStore";
import { DiaryEntry } from "@/types/diary";
import Editor, { EditorRef } from "@/components/Editor";
import useTheme from "@/hooks/useTheme";
import { useThemeColors } from "@/hooks";
import { getIconPath } from "../../utils/getIconPath";
import {
  getMoodColor,
  getTypeColor,
  hexToRgba,
} from "../../constants/moodConfig";
import { WEATHER_ICONS } from "../../constants/icons";
import {
  contentLinkExtension,
  chatReferenceExtension,
  questionCardExtension,
  fileAttachmentExtension,
} from "@/editor-extensions";
const customExtensions = [
  contentLinkExtension,
  chatReferenceExtension,
  questionCardExtension,
  fileAttachmentExtension,
];
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
  const { timelineRingColor, timelineRingColorDark } = useThemeColors();

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRefsMap = useRef<Map<string, EditorRef>>(new Map());
  const { isDark } = useTheme();

  const themeColor = isDark ? timelineRingColorDark : timelineRingColor;

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
      <div className="flex items-center justify-center h-full">
        <p className="m-0 text-[15px] text-gray-400 dark:text-gray-500">
          本月暂无记录
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto overflow-x-hidden p-8 box-border flex flex-col items-center"
      onScroll={handleScroll}
    >
      <div className="w-full max-w-[900px] flex flex-col">
        {monthEntries.map((entry, index) => {
          const { day, weekday, month: monthText } = getDisplayDate(entry);

          // Serialize weather and mood to JSON strings for processing
          const weatherStr = entry.weather
            ? JSON.stringify(entry.weather)
            : null;
          const moodStr = entry.mood ? JSON.stringify(entry.mood) : null;

          const moodColor = getMoodColor(moodStr);
          const typeColor = getTypeColor(entry.type);
          const weatherIconSrc = getIconPath(weatherStr, "weather");
          const moodIconSrc = getIconPath(moodStr, "mood");

          const isFirstOfDay =
            index === 0 || entry.date !== monthEntries[index - 1].date;

          const baseRingColor = isDark ? "#0F172A" : "#FFFFFF";
          // 使用主题色创建背景色
          const themeColorRgb = themeColor.match(/\d+/g);
          const cardBackground = themeColorRgb
            ? `rgba(${themeColorRgb[0]}, ${themeColorRgb[1]}, ${themeColorRgb[2]}, ${isDark ? 0.15 : 0.08})`
            : hexToRgba(moodColor, isDark ? 0.15 : 0.08);

          return (
            <div
              key={entry.id}
              className="grid grid-cols-[80px_20px_1fr] gap-5 mb-8 cursor-pointer min-w-0 max-w-full relative"
              onClick={() => handleEntryClick(entry)}
              style={{
                // @ts-ignore
                "--mood-color": moodColor,
              }}
            >
              {/* Left: Date */}
              {isFirstOfDay && (
                <div className="flex flex-col items-center pt-1">
                  <div className="text-4xl font-light text-gray-800 dark:text-gray-100 leading-none">
                    {day}
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-300 mt-1.5 font-medium">
                    {weekday}
                  </div>
                  <div className="text-[11px] text-gray-300 dark:text-gray-400 mt-0.5">
                    {monthText}
                  </div>
                </div>
              )}
              {!isFirstOfDay && (
                <div className="flex flex-col items-center pt-1" />
              )}

              <div className="flex justify-center pt-4 relative z-1">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: themeColor,
                    boxShadow: `0 0 0 3px ${baseRingColor}, 0 0 0 5px ${themeColor}40`,
                  }}
                />
              </div>

              <div className="min-w-0">
                <div
                  className={`p-5 rounded-[10px] bg-white dark:bg-gray-900 transition-all duration-200 relative overflow-hidden wrap-break-word border border-l-2 hover:shadow-md`}
                  style={{
                    border: `${themeColor} 1px solid`,
                    borderLeft: `${themeColor} 2px solid`,
                    backgroundColor: cardBackground,
                  }}
                >
                  {entry.type !== "daily" && (
                    <div
                      className="absolute top-3 right-3 px-2.5 py-1 rounded-md text-[11px] text-white font-semibold tracking-wide"
                      style={{ backgroundColor: typeColor }}
                    >
                      {entry.type === "weekly" ? "周记" : "月记"}
                    </div>
                  )}

                  {(weatherIconSrc || moodIconSrc) && (
                    <div className="flex gap-2.5 mb-3.5">
                      {weatherIconSrc && entry.weather && (
                        <div
                          className="w-[22px] h-[22px] block"
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
                          className="w-[22px] h-[22px] object-contain"
                        />
                      )}
                    </div>
                  )}

                  <div className="text-[15px] text-gray-600 dark:text-gray-300 leading-[1.7] overflow-hidden wrap-break-word">
                    {entry.content && entry.content.length > 0 ? (
                      <Editor
                        ref={(ref) => {
                          if (ref) {
                            editorRefsMap.current.set(String(entry.id), ref);
                          }
                        }}
                        extensions={customExtensions}
                        initValue={entry.content}
                        readonly={true}
                        className="text-sm"
                      />
                    ) : (
                      <div className="text-gray-400 italic">（空）</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default TimelineView;
