import { memo, useMemo } from "react";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { DiaryEntry } from "@/types/diary";
import useDiaryStore from "@/stores/useDiaryStore";
import { getEditorText } from "@/utils";
import useTheme from "@/hooks/useTheme";
import { useThemeColors } from "@/hooks";
import { getIconPath } from "../../utils/getIconPath";
import { getMoodColor, hexToRgba } from "../../constants/moodConfig";
import { WEATHER_ICONS } from "../../constants/icons";

dayjs.extend(isoWeek);

interface SidebarTimelineProps {
  entries: DiaryEntry[];
  onEntryClick?: (entry: DiaryEntry) => void;
}

const SidebarTimeline = memo(
  ({ entries, onEntryClick }: SidebarTimelineProps) => {
    const { setCurrentDate, setCurrentViewMode } = useDiaryStore();
    const { isDark } = useTheme();
    const { borderClass } = useThemeColors();

    const sortedEntries = useMemo(() => {
      return [...entries].sort((a, b) => b.date.localeCompare(a.date));
    }, [entries]);

    const handleEntryClick = (entry: DiaryEntry) => {
      // Navigate to the entry
      if (entry.type === "daily") {
        setCurrentDate(entry.date);
        setCurrentViewMode("daily");
      } else if (entry.type === "weekly") {
        // Extract date from week string (YYYY-Www)
        const [year, week] = entry.date.split("-W");
        const weekStart = dayjs()
          .year(parseInt(year))
          .isoWeek(parseInt(week))
          .startOf("isoWeek");
        setCurrentDate(weekStart.format("YYYY-MM-DD"));
        setCurrentViewMode("weekly");
      } else if (entry.type === "monthly") {
        // Extract date from month string (YYYY-MM)
        const [year, month] = entry.date.split("-");
        const monthStart = dayjs(`${year}-${month}-01`);
        setCurrentDate(monthStart.format("YYYY-MM-DD"));
        setCurrentViewMode("monthly");
      }

      onEntryClick?.(entry);
    };

    const getDisplayDate = (entry: DiaryEntry): string => {
      if (entry.type === "daily") {
        const date = dayjs(entry.date);
        return date.format("MM-DD");
      } else if (entry.type === "weekly") {
        const [year, week] = entry.date.split("-W");
        return `${year}W${week}`;
      } else if (entry.type === "monthly") {
        const [year, month] = entry.date.split("-");
        return `${year}-${month}`;
      }
      return entry.date;
    };

    const getDisplayWeekday = (entry: DiaryEntry): string => {
      if (entry.type === "daily") {
        const date = dayjs(entry.date);
        const weekdays = [
          "周日",
          "周一",
          "周二",
          "周三",
          "周四",
          "周五",
          "周六",
        ];
        return weekdays[date.day()];
      }
      return "";
    };

    if (sortedEntries.length === 0) {
      return (
        <div className="p-8 text-center">
          <p className="m-0 text-[13px] text-gray-400 dark:text-gray-500">
            暂无记录
          </p>
        </div>
      );
    }

    return (
      <div className="h-full p-2">
        {sortedEntries.map((entry) => {
          // Serialize weather and mood to JSON strings for processing
          const weatherStr = entry.weather
            ? JSON.stringify(entry.weather)
            : null;
          const moodStr = entry.mood ? JSON.stringify(entry.mood) : null;

          const moodColor = getMoodColor(moodStr);
          const content = getEditorText(entry.content, 50);
          const weatherIconSrc = getIconPath(weatherStr, "weather");
          const moodIconSrc = getIconPath(moodStr, "mood");
          const circleRingColor = isDark ? "#0F172A" : "#FFFFFF";
          const circleGlowOpacity = isDark ? 0.45 : 0.3;
          const cardBackground = hexToRgba(moodColor, isDark ? 0.15 : 0.06);

          return (
            <div
              key={entry.id}
              className="grid grid-cols-[48px_12px_1fr] gap-2 mb-4 cursor-pointer relative"
              onClick={() => handleEntryClick(entry)}
              style={{
                // @ts-ignore
                "--mood-color": moodColor,
              }}
            >
              <div className="flex flex-col items-center pt-[2px]">
                <div className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 text-center leading-tight">
                  {getDisplayDate(entry)}
                </div>
                {entry.type === "daily" && (
                  <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-[2px]">
                    {getDisplayWeekday(entry)}
                  </div>
                )}
                {entry.type === "weekly" && (
                  <div className="text-[9px] text-gray-500 dark:text-gray-300 mt-[2px] px-[5px] py-[2px] bg-gray-100 dark:bg-gray-800 rounded-[3px] font-medium">
                    周记
                  </div>
                )}
                {entry.type === "monthly" && (
                  <div className="text-[9px] text-gray-500 dark:text-gray-300 mt-[2px] px-[5px] py-[2px] bg-gray-100 dark:bg-gray-800 rounded-[3px] font-medium">
                    月记
                  </div>
                )}
              </div>

              <div className="flex justify-center pt-[10px] relative z-1">
                <div
                  className="w-[6px] h-[6px] rounded-full dark:bg-gray-800"
                  style={{
                    backgroundColor: moodColor,
                    boxShadow: `0 0 0 2px ${circleRingColor}, 0 0 0 3px ${hexToRgba(moodColor, circleGlowOpacity)}`,
                  }}
                />
              </div>

              <div>
                <div
                  className={`card p-[10px] min-h-[40px] rounded-[6px] transition-all duration-200 border border-l-2 ${borderClass} hover:shadow-sm`}
                  style={{
                    borderLeftColor: moodColor,
                    backgroundColor: cardBackground,
                  }}
                >
                  {(weatherIconSrc || moodIconSrc) && (
                    <div className="flex gap-[6px] mb-[6px]">
                      {weatherIconSrc && entry.weather && (
                        <div
                          className="w-[14px] h-[14px] block"
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
                          className="w-[14px] h-[14px] object-contain"
                        />
                      )}
                    </div>
                  )}
                  <div className="text-[12px] text-gray-500 dark:text-gray-300 leading-normal overflow-hidden text-ellipsis line-clamp-2">
                    {content || (
                      <span className="text-gray-400 dark:text-gray-500">
                        （空）
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  },
);

export default SidebarTimeline;
