import React, { useState } from "react";
import classNames from "classnames";
import { motion } from "motion/react";
import useThemeColors from "@/hooks/useThemeColors";
import { TYPE_COLORS, TYPE_LABELS, type TrendMetric } from "./constants";
import type { HomeTrendType } from "../../hooks/useHomeData";
import type { RatioItem } from "./useActivityChartData";

interface CategoryBreakdownProps {
  ratio: { total: number; items: RatioItem[] };
  metric: TrendMetric;
}

const CategoryBreakdown: React.FC<CategoryBreakdownProps> = ({
  ratio,
  metric,
}) => {
  const themeColors = useThemeColors();
  const [hovered, setHovered] = useState<HomeTrendType | null>(null);

  const size = 148;
  const strokeWidth = 14;
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  let cumulative = 0;
  const segments = ratio.items.map((item) => {
    const arc = item.ratio * circumference;
    const offset = -cumulative;
    cumulative += arc;
    return { ...item, arc, offset };
  });

  const metricLabel = metric === "count" ? "篇" : "字";
  const activeItem = hovered
    ? ratio.items.find((i) => i.type === hovered)
    : null;
  const centerValue = activeItem ? activeItem.value : ratio.total;
  const centerLabel = activeItem ? TYPE_LABELS[activeItem.type] : "总创作";

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="var(--th-border)"
            strokeWidth={strokeWidth}
            opacity="0.4"
          />
          {segments.map((seg) => {
            const isHovered = hovered === seg.type;
            return (
              <motion.circle
                key={seg.type}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={TYPE_COLORS[seg.type]}
                strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                strokeDasharray={`${seg.arc} ${circumference - seg.arc}`}
                strokeDashoffset={seg.offset}
                strokeLinecap="butt"
                initial={{ strokeDasharray: `0 ${circumference}` }}
                animate={{
                  strokeDasharray: `${seg.arc} ${circumference - seg.arc}`,
                }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                onMouseEnter={() => setHovered(seg.type)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: "pointer", transition: "stroke-width 0.2s" }}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            key={`${centerValue}-${centerLabel}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={classNames(
              "text-2xl font-bold tabular-nums",
              themeColors.textClass,
            )}
          >
            {centerValue.toLocaleString()}
          </motion.span>
          <span
            className={classNames(
              "mt-0.5 text-xs",
              themeColors.secondaryTextClass,
            )}
          >
            {centerLabel} · {metricLabel}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {ratio.items.map((item) => (
          <div
            key={item.type}
            onMouseEnter={() => setHovered(item.type)}
            onMouseLeave={() => setHovered(null)}
            className={classNames(
              "flex items-center gap-2.5 rounded-lg px-2 py-1 transition-colors cursor-pointer",
              hovered === item.type && "bg-[var(--th-hover-bg)]",
            )}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: TYPE_COLORS[item.type] }}
            />
            <span className={classNames("text-xs", themeColors.textClass)}>
              {TYPE_LABELS[item.type]}
            </span>
            <span
              className={classNames(
                "ml-auto text-xs tabular-nums",
                themeColors.secondaryTextClass,
              )}
            >
              {item.value.toLocaleString()}
            </span>
            <span
              className={classNames(
                "w-12 text-right text-xs font-medium tabular-nums",
                themeColors.textClass,
              )}
            >
              {(item.ratio * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CategoryBreakdown;
