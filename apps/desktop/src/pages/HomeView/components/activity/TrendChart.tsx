import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import classNames from "classnames";
import { motion } from "motion/react";
import dayjs from "dayjs";
import useThemeColors from "@/hooks/useThemeColors";
import {
  TYPE_COLORS,
  TYPE_LABELS,
  type TrendRange,
  type TrendMode,
  type TrendMetric,
} from "./constants";
import type { ActivityChartData } from "./useActivityChartData";

interface TrendChartProps {
  data: ActivityChartData;
  range: TrendRange;
  mode: TrendMode;
  metric: TrendMetric;
}

const CHART_HEIGHT = 248;
const PAD_LEFT = 46;
const PAD_RIGHT = 14;
const PAD_TOP = 14;
const PAD_BOTTOM = 30;

const useElementWidth = () => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
};

const formatNumber = (n: number) => {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
};

// Catmull-Rom 样条转贝塞尔曲线，生成平滑路径
// continueFrom 时不输出开头的 M 命令，用于面积图底边拼接
const smoothPath = (
  pts: { x: number; y: number }[],
  tension = 0.5,
  continueFrom = false,
): string => {
  if (pts.length === 0) return "";
  if (pts.length === 1)
    return continueFrom
      ? `L ${pts[0].x} ${pts[0].y}`
      : `M ${pts[0].x} ${pts[0].y}`;
  if (pts.length === 2)
    return continueFrom
      ? `L ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`
      : `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  let d = continueFrom
    ? `L ${pts[0].x} ${pts[0].y}`
    : `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + ((p2.x - p0.x) / 6) * tension;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * tension;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * tension;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * tension;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
};

const TrendChart: React.FC<TrendChartProps> = ({
  data,
  range,
  mode,
  metric,
}) => {
  const themeColors = useThemeColors();
  const [ref, width] = useElementWidth();
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipW, setTooltipW] = useState(220);
  // tooltip 挂载后测量真实宽度并重渲染，确保定位基于真实尺寸
  useLayoutEffect(() => {
    if (tooltipRef.current) {
      const w = tooltipRef.current.offsetWidth;
      if (w > 0) setTooltipW(w);
    }
  }, [hoverIndex]);

  const { buckets, maxValue, types } = data;
  const chartW = Math.max(width - PAD_LEFT - PAD_RIGHT, 0);
  const chartH = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

  // 增量统一柱状图（周日/月周/年月/总览年）；累计统一面积图
  const isCumulative = mode === "cumulative";
  const isBar = !isCumulative;
  const isStackedArea = isCumulative && types.length > 1;
  const isAreaLine = isCumulative && types.length === 1;

  const bucketWidth = buckets.length > 0 ? chartW / buckets.length : 0;
  const barGroupWidth = bucketWidth * 0.62;
  const barWidth = types.length > 0 ? barGroupWidth / types.length : 0;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    value: Math.round(maxValue * t),
    y: PAD_TOP + chartH * (1 - t),
  }));

  // X 轴 label 索引：总览按月采样；月累计30日点采样；周/年/月增量 bucket 少全渲染
  // X 轴 label 索引（getX 之后才能用像素间距判断）
  // 柱状图 label 全部居中对齐到 bucket 中心；折线/面积图首尾用 start/end 避免溢出
  const getLabelAnchor = (i: number): "start" | "middle" | "end" => {
    if (isBar) return "middle";
    if (i === 0) return "start";
    if (i === buckets.length - 1) return "end";
    return "middle";
  };

  const getX = (i: number) =>
    buckets.length === 1
      ? PAD_LEFT + chartW / 2
      : isBar
        ? PAD_LEFT + bucketWidth / 2 + i * bucketWidth
        : PAD_LEFT + (i / (buckets.length - 1)) * chartW;

  // label 最小像素间距，避免相邻 label 重合
  const MIN_LABEL_GAP = 56;
  const labelIndices: number[] = [];
  if (range === "all" && !isBar) {
    // 总览累计(多周)按月采样，用像素间距跳过太近的
    let lastMonth = "";
    let lastX = -Infinity;
    for (let i = 0; i < buckets.length; i++) {
      const m = dayjs(buckets[i].snapshotDate).format("YYYY-MM");
      if (m !== lastMonth) {
        const x = getX(i);
        if (x - lastX >= MIN_LABEL_GAP || labelIndices.length === 0) {
          labelIndices.push(i);
          lastX = x;
          lastMonth = m;
        }
      }
    }
  } else if (buckets.length > 14) {
    const step = Math.ceil(buckets.length / 6);
    for (let i = 0; i < buckets.length; i += step) {
      labelIndices.push(i);
    }
  } else {
    for (let i = 0; i < buckets.length; i++) {
      labelIndices.push(i);
    }
  }

  const getY = (value: number) => PAD_TOP + chartH * (1 - value / maxValue);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (buckets.length === 0 || chartW === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let nearest = 0;
    let minDist = Infinity;
    for (let i = 0; i < buckets.length; i++) {
      const d = Math.abs(getX(i) - x);
      if (d < minDist) {
        minDist = d;
        nearest = i;
      }
    }
    setHoverIndex(nearest);
  };

  const tooltip = hoverIndex !== null ? buckets[hoverIndex] : null;
  const tooltipX = hoverIndex !== null ? getX(hoverIndex) : 0;
  // 夹紧式定位：理想居中 left = tooltipX - tooltipW/2，再夹到容器内，永不溢出
  const GAP = 10;
  const tooltipLeft =
    width > 0
      ? Math.min(
          Math.max(tooltipX - tooltipW / 2, GAP),
          Math.max(width - tooltipW - GAP, GAP),
        )
      : tooltipX;

  const metricLabel = metric === "count" ? "篇" : "字";

  if (!data.hasData) {
    return (
      <div
        ref={ref}
        className={classNames(
          "flex items-center justify-center text-sm",
          themeColors.secondaryTextClass,
        )}
        style={{ height: CHART_HEIGHT }}
      >
        暂无创作数据
      </div>
    );
  }

  return (
    <div ref={ref} className="relative" style={{ height: CHART_HEIGHT }}>
      <svg
        width={width}
        height={CHART_HEIGHT}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          {types.map((type) => (
            <linearGradient
              key={type}
              id={`grad-${type}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor={TYPE_COLORS[type]}
                stopOpacity="0.32"
              />
              <stop
                offset="100%"
                stopColor={TYPE_COLORS[type]}
                stopOpacity="0.02"
              />
            </linearGradient>
          ))}
        </defs>

        {ticks.map((tick, i) => (
          <g key={i}>
            <line
              x1={PAD_LEFT}
              x2={width - PAD_RIGHT}
              y1={tick.y}
              y2={tick.y}
              stroke="var(--th-border)"
              strokeWidth="1"
              opacity="0.5"
            />
            <text
              x={PAD_LEFT - 8}
              y={tick.y + 4}
              textAnchor="end"
              fill="var(--th-text-secondary)"
              fontSize="11"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatNumber(tick.value)}
            </text>
          </g>
        ))}

        {isBar &&
          buckets.map((bucket, i) => {
            const groupX = getX(i) - barGroupWidth / 2;
            return (
              <g key={bucket.bucket}>
                {bucket.values.map((v, j) => {
                  const isZero = v.value === 0;
                  const barH = isZero ? 3 : (v.value / maxValue) * chartH;
                  const barX = groupX + j * barWidth;
                  const barY = PAD_TOP + chartH - barH;
                  return (
                    <motion.rect
                      key={v.type}
                      x={barX}
                      width={Math.max(barWidth - 1, 1)}
                      rx={2}
                      fill={TYPE_COLORS[v.type]}
                      opacity={isZero ? 0.1 : 0.9}
                      initial={{ height: 0, y: PAD_TOP + chartH }}
                      animate={{ height: barH, y: barY }}
                      transition={{
                        duration: 0.5,
                        ease: "easeOut",
                        delay: i * 0.015,
                      }}
                    />
                  );
                })}
              </g>
            );
          })}

        {isStackedArea &&
          (() => {
            // 预计算每个 bucket 每一层的堆叠顶值与底值
            const layers = types.map((type, layerIdx) => {
              const pts = buckets.map((b, i) => {
                const v = b.values.find((x) => x.type === type)?.value ?? 0;
                let stack = v;
                for (let k = 0; k < layerIdx; k++) {
                  stack +=
                    b.values.find((x) => x.type === types[k])?.value ?? 0;
                }
                return {
                  x: getX(i),
                  top: getY(stack),
                  bottom: getY(stack - v),
                  value: v,
                };
              });
              return { type, pts };
            });
            return layers.map((layer, layerIdx) => {
              const topPts = layer.pts.map((p) => ({ x: p.x, y: p.top }));
              const bottomPts = layer.pts
                .slice()
                .reverse()
                .map((p) => ({ x: p.x, y: p.bottom }));
              const topLine = smoothPath(topPts);
              const bottomLine = smoothPath(bottomPts, 0.5, true);
              const areaD = `${topLine} ${bottomLine} Z`;
              return (
                <g key={layer.type}>
                  <motion.path
                    d={areaD}
                    fill={`url(#grad-${layer.type})`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.15 * layerIdx }}
                  />
                  <motion.path
                    d={topLine}
                    fill="none"
                    stroke={TYPE_COLORS[layer.type]}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                  />
                </g>
              );
            });
          })()}

        {isAreaLine &&
          types.map((type) => {
            const points = buckets.map((b, i) => {
              const v = b.values.find((x) => x.type === type)?.value ?? 0;
              return { x: getX(i), y: getY(v), value: v };
            });
            if (points.length === 0) return null;
            const lineD = smoothPath(points);
            const areaD = `${lineD} L ${points[points.length - 1].x} ${PAD_TOP + chartH} L ${points[0].x} ${PAD_TOP + chartH} Z`;
            return (
              <g key={type}>
                <motion.path
                  d={areaD}
                  fill={`url(#grad-${type})`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                />
                <motion.path
                  d={lineD}
                  fill="none"
                  stroke={TYPE_COLORS[type]}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.8, ease: "easeInOut" }}
                />
                {points.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={hoverIndex === i ? 4 : 0}
                    fill={TYPE_COLORS[type]}
                    stroke="var(--th-card-bg)"
                    strokeWidth="1.5"
                    style={{ transition: "r 0.15s" }}
                  />
                ))}
              </g>
            );
          })}

        {hoverIndex !== null && (
          <line
            x1={tooltipX}
            x2={tooltipX}
            y1={PAD_TOP}
            y2={PAD_TOP + chartH}
            stroke="var(--th-text-secondary)"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.6"
          />
        )}

        {labelIndices.map((i) => {
          const bucket = buckets[i];
          return (
            <text
              key={bucket.bucket}
              x={getX(i)}
              y={CHART_HEIGHT - 10}
              textAnchor={getLabelAnchor(i)}
              fill="var(--th-text-secondary)"
              fontSize="11"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {bucket.label}
            </text>
          );
        })}
      </svg>

      {tooltip && (
        <motion.div
          key={hoverIndex}
          ref={tooltipRef}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className={classNames(
            "pointer-events-none absolute z-20 rounded-lg border px-3 py-2 text-xs shadow-lg",
            themeColors.cardBorderClass,
            themeColors.cardBgClass,
          )}
          style={{ left: tooltipLeft, top: 8 }}
        >
          <div
            className={classNames("mb-1 font-medium", themeColors.textClass)}
          >
            {isBar || range === "year" || tooltip.label.includes("-")
              ? tooltip.label
              : dayjs(tooltip.snapshotDate).format("YYYY-MM-DD")}
          </div>
          {tooltip.values.map((v) => (
            <div key={v.type} className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: TYPE_COLORS[v.type] }}
              />
              <span className={themeColors.secondaryTextClass}>
                {TYPE_LABELS[v.type]}
              </span>
              <span
                className={classNames(
                  "ml-auto font-medium",
                  themeColors.textClass,
                )}
              >
                {v.value.toLocaleString()} {metricLabel}
              </span>
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
};

export default TrendChart;
