import React, { useState } from "react";
import classNames from "classnames";
import { motion } from "motion/react";
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
  contentTrend: HomeTrendPoint[];
}

const ActivityDashboard: React.FC<ActivityDashboardProps> = ({
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
      <div className="flex items-baseline gap-2">
        <h2
          className={classNames("text-sm font-semibold", themeColors.textClass)}
        >
          创作动态
        </h2>
        <span
          className={classNames(
            "text-xs tabular-nums",
            themeColors.secondaryTextClass,
          )}
        >
          {chartData.ratio.total.toLocaleString()}{" "}
          {metric === "count" ? "篇" : "字"}
        </span>
      </div>

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

      <motion.div
        layout
        className="@container rounded-2xl bg-[var(--th-input-bg)] p-5"
      >
        <div className="flex flex-col gap-6 @3xl:flex-row @3xl:items-center">
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
          <div className="shrink-0 rounded-xl p-4 bg-[var(--th-hover-bg)] @3xl:self-center">
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
