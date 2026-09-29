/**
 * 设置页用量图表 —— echarts 的薄封装：颜色取 --tau-* 语义 token（分类色 tag-1…5 + accent），
 * 随主题族与明暗切换重建，不写死色值。按需引入 echarts 组件以控制体积。
 */

import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import { useThemeStore } from "@tau/themes/react";

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);

export interface UsageChartPalette {
  series: string[];
  ink1: string;
  ink2: string;
  ink3: string;
  line: string;
  surface: string;
}

let probe: CanvasRenderingContext2D | null | undefined;

/**
 * 任意 CSS 颜色 → rgba()。token 里有 `hsl(22 58% 42%)` 这类空格语法，canvas 能画，
 * 但 echarts 悬停时要自己解析颜色算高亮 / 淡化色，解析不了会得到无效色（悬停项像消失了）。
 * 画一个像素再读回来，任何浏览器认得的写法都能归一。
 */
const toRgba = (color: string, fallback: string) => {
  probe ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!probe) return fallback;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = fallback;
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  return `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 100) / 100})`;
};

const readVar = (style: CSSStyleDeclaration, name: string, fallback: string) =>
  toRgba(style.getPropertyValue(name).trim() || fallback, fallback);

/** 当前主题的图表配色；theme / mode 变化时重新读取 */
export function useUsageChartPalette(): UsageChartPalette {
  const theme = useThemeStore(state => state.theme);
  const mode = useThemeStore(state => state.mode);
  return useMemo(() => {
    const style = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string) => readVar(style, name, fallback);
    return {
      series: [
        v("--tau-accent", "#b0643a"),
        v("--tau-tag-2", "#5c7d99"),
        v("--tau-tag-1", "#61795f"),
        v("--tau-tag-4", "#a38c4d"),
        v("--tau-tag-3", "#8a7aa6"),
        v("--tau-tag-5", "#b06a5e"),
        v("--tau-ink-3", "#a89a85"),
      ],
      ink1: v("--tau-ink-1", "#43392c"),
      ink2: v("--tau-ink-2", "#6a5c49"),
      ink3: v("--tau-ink-3", "#a89a85"),
      line: v("--tau-line-1", "#e9e1d2"),
      surface: v("--tau-bg-surface", "#fffdf8"),
    };
    // theme / mode 只作重算触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, mode]);
}

export function UsageChart({
  option,
  height,
  ariaLabel,
}: {
  option: EChartsCoreOption;
  height: number;
  /** 图表的文字说明（屏幕阅读器读这个，canvas 本身不可读） */
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  return <div ref={ref} role="img" aria-label={ariaLabel} style={{ width: "100%", height }} />;
}
