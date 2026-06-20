import React, { useMemo } from "react";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";
import { Popover } from "antd";

interface ActivityHeatmapProps {
  data: Record<string, number>;
  className?: string;
}

const ActivityHeatmap: React.FC<ActivityHeatmapProps> = ({
  data,
  className,
}) => {
  const themeColors = useThemeColors();

  // Generate 365 days of data
  const heatmapData = useMemo(() => {
    const today = new Date();
    const days: Array<{ date: string; count: number; dayOfWeek: number }> = [];

    for (let i = 364; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      const count = data[dateStr] || 0;
      const dayOfWeek = date.getDay();

      days.push({ date: dateStr, count, dayOfWeek });
    }

    return days;
  }, [data]);

  // Group by weeks
  const weeks = useMemo(() => {
    const weekArray: Array<
      Array<{ date: string; count: number; dayOfWeek: number }>
    > = [];
    let currentWeek: Array<{ date: string; count: number; dayOfWeek: number }> =
      [];

    // Pad the beginning if the first day is not Sunday
    const firstDayOfWeek = heatmapData[0].dayOfWeek;
    for (let i = 0; i < firstDayOfWeek; i++) {
      currentWeek.push({ date: "", count: 0, dayOfWeek: i });
    }

    heatmapData.forEach((day) => {
      currentWeek.push(day);
      if (day.dayOfWeek === 6) {
        weekArray.push(currentWeek);
        currentWeek = [];
      }
    });

    // Add remaining days
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push({ date: "", count: 0, dayOfWeek: currentWeek.length });
      }
      weekArray.push(currentWeek);
    }

    return weekArray;
  }, [heatmapData]);

  // Calculate intensity levels
  const getIntensity = (count: number): number => {
    if (count === 0) return 0;
    const maxCount = Math.max(...Object.values(data), 1);
    const normalized = count / maxCount;

    if (normalized <= 0.25) return 1;
    if (normalized <= 0.5) return 2;
    if (normalized <= 0.75) return 3;
    return 4;
  };

  const getCellColor = (count: number, isEmpty: boolean): string => {
    if (isEmpty) return "transparent";

    const intensity = getIntensity(count);
    const baseColor = themeColors.accentColor;

    if (intensity === 0) return "rgb(235, 237, 240)"; // Light gray for zero

    // Use theme accent color with varying opacity
    const opacities = [0, 0.25, 0.5, 0.75, 1];
    return baseColor
      .replace("rgb", "rgba")
      .replace(")", `, ${opacities[intensity]})`);
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const cellSize = 12;
  const cellGap = 3;

  return (
    <div className={classNames("overflow-x-auto", className)}>
      <div className="inline-block min-w-full">
        <div className="flex gap-1">
          {/* Day labels */}
          <div
            className="flex flex-col justify-around pr-2"
            style={{ height: 7 * (cellSize + cellGap) }}
          >
            {["日", "一", "二", "三", "四", "五", "六"].map((day, i) => (
              <div
                key={i}
                className={classNames(
                  "text-xs",
                  themeColors.secondaryTextClass,
                )}
                style={{ height: cellSize, lineHeight: `${cellSize}px` }}
              >
                {i % 2 === 1 ? day : ""}
              </div>
            ))}
          </div>

          {/* Heatmap grid */}
          <div className="flex gap-1">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-1">
                {week.map((day, dayIndex) => {
                  const isEmpty = !day.date;
                  const cellColor = getCellColor(day.count, isEmpty);

                  const cell = (
                    <div
                      key={dayIndex}
                      className={classNames(
                        "rounded-sm transition-all",
                        !isEmpty && "hover:ring-2 hover:ring-offset-1",
                        themeColors.cardBorderClass,
                      )}
                      style={{
                        width: cellSize,
                        height: cellSize,
                        backgroundColor: cellColor,
                      }}
                    />
                  );

                  if (isEmpty) {
                    return cell;
                  }

                  return (
                    <Popover
                      key={dayIndex}
                      content={
                        <div className="text-sm">
                          <div className="font-medium">
                            {formatDate(day.date)}
                          </div>
                          <div className={themeColors.secondaryTextClass}>
                            {day.count} 次操作
                          </div>
                        </div>
                      }
                      placement="top"
                    >
                      {cell}
                    </Popover>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-end gap-2 mt-3">
          <span
            className={classNames("text-xs", themeColors.secondaryTextClass)}
          >
            少
          </span>
          {[0, 1, 2, 3, 4].map((level) => (
            <div
              key={level}
              className="rounded-sm"
              style={{
                width: cellSize,
                height: cellSize,
                backgroundColor: getCellColor(
                  level === 0 ? 0 : level * 25,
                  false,
                ),
              }}
            />
          ))}
          <span
            className={classNames("text-xs", themeColors.secondaryTextClass)}
          >
            多
          </span>
        </div>
      </div>
    </div>
  );
};

export default ActivityHeatmap;
