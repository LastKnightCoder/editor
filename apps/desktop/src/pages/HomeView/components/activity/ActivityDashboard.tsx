import React, { useState } from "react";
import classNames from "classnames";
import dayjs from "dayjs";
import { motion } from "motion/react";
import CalendarHeatmap, { type IItem } from "@/components/CalendarHeatmap";
import useThemeColors from "@/hooks/useThemeColors";
import type { HomeTrendPoint } from "../../hooks/useHomeData";
import AnimatedSegmented from "./AnimatedSegmented";
import TrendChart from "./TrendChart";
import CategoryBreakdown from "./CategoryBreakdown";
import useActivityChartData from "./useActivityChartData";
import {
  RANGES,
  MODES,
  METRICS,
  CATEGORIES,
  type TrendRange,
  type TrendMode,
  type TrendMetric,
  type TrendCategory,
} from "./constants";

interface ActivityDashboardProps {
  activityHeatmap: IItem[];
  contentTrend: HomeTrendPoint[];
}

const ActivityDashboard: React.FC<ActivityDashboardProps> = ({
  activityHeatmap,
  contentTrend,
}) => {
  const themeColors = useThemeColors();
  const [range, setRange] = useState<TrendRange>("week");
  const [mode, setMode] = useState<TrendMode>("increment");
  const [metric, setMetric] = useState<TrendMetric>("count");
  const [category, setCategory] = useState<TrendCategory>("all");

  const chartData = useActivityChartData(
    contentTrend,
    range,
    mode,
    metric,
    category,
  );

  return (
    <section className="space-y-5">
      <CalendarHeatmap
        className="px-1"
        data={activityHeatmap}
        year={dayjs().format("YYYY")}
        renderTooltip={(date, value) => `${date}: ${value?.count ?? 0} 次操作`}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2
          className={classNames(
            "text-base font-semibold",
            themeColors.textClass,
          )}
        >
          创作动态
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <AnimatedSegmented
            options={RANGES}
            value={range}
            onChange={setRange}
            layoutId="act-range"
          />
          <AnimatedSegmented
            options={MODES}
            value={mode}
            onChange={setMode}
            layoutId="act-mode"
          />
          <AnimatedSegmented
            options={METRICS}
            value={metric}
            onChange={setMetric}
            layoutId="act-metric"
          />
          <AnimatedSegmented
            options={CATEGORIES}
            value={category}
            onChange={setCategory}
            layoutId="act-category"
          />
        </div>
      </div>

      <motion.div
        layout
        className={classNames(
          "rounded-2xl border p-5",
          themeColors.cardBorderClass,
          themeColors.cardBgClass,
        )}
      >
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex items-center justify-between">
              <span
                className={classNames(
                  "text-xs font-medium",
                  themeColors.secondaryTextClass,
                )}
              >
                {mode === "cumulative" ? "累计趋势" : "增量趋势"}
              </span>
            </div>
            <TrendChart
              data={chartData}
              range={range}
              mode={mode}
              metric={metric}
            />
          </div>
          <div
            className={classNames(
              "shrink-0 rounded-xl border p-4",
              themeColors.cardBorderClass,
            )}
            style={{ backgroundColor: "var(--th-hover-bg)" }}
          >
            <div
              className={classNames(
                "mb-3 text-xs font-medium",
                themeColors.secondaryTextClass,
              )}
            >
              类别构成
            </div>
            <CategoryBreakdown ratio={chartData.ratio} metric={metric} />
          </div>
        </div>
      </motion.div>
    </section>
  );
};

export default ActivityDashboard;
