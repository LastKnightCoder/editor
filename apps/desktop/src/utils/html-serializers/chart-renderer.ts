import type { ChartConfig } from "@tau/editor/src/types";
import * as echarts from "echarts";

const COLORS = [
  "#6366f1",
  "#ec4899",
  "#14b8a6",
  "#f59e0b",
  "#8b5cf6",
  "#06b6d4",
  "#f43f5e",
  "#84cc16",
];

/**
 * Generate ECharts option from chart data and config
 */
function getChartOption(
  data: Record<string, string | number>[],
  config: ChartConfig,
): echarts.EChartsOption {
  const { type, xAxisKey, series, showLegend, showGrid } = config;
  const textColor = "#6b7280";
  const axisLineColor = "#e5e7eb";

  switch (type) {
    case "line":
    case "bar":
    case "area":
      return {
        backgroundColor: "transparent",
        grid: {
          left: 60,
          right: 30,
          top: showLegend ? 50 : 20,
          bottom: 50,
          containLabel: false,
        },
        xAxis: {
          type: "category",
          data: data.map((d) => d[xAxisKey || ""]),
          axisLine: { lineStyle: { color: axisLineColor } },
          axisLabel: { color: textColor },
        },
        yAxis: {
          type: "value",
          axisLine: { lineStyle: { color: axisLineColor } },
          axisLabel: { color: textColor },
          splitLine: showGrid
            ? { lineStyle: { color: axisLineColor } }
            : { show: false },
        },
        series: series.map((s, i) => ({
          name: s.name || s.dataKey,
          type: type === "area" ? "line" : type,
          data: data.map((d) => d[s.dataKey]),
          smooth: type === "line" || type === "area",
          areaStyle: type === "area" ? { opacity: 0.3 } : undefined,
          itemStyle: { color: s.color || COLORS[i % COLORS.length] },
        })),
        tooltip: { trigger: "axis" },
        legend: showLegend
          ? { textStyle: { color: textColor }, top: 10 }
          : undefined,
      };

    case "pie": {
      const pieStyle = config.pieStyle || "normal";
      const radius =
        pieStyle === "donut"
          ? ["40%", "70%"]
          : pieStyle === "rose"
            ? [20, "70%"]
            : "60%";
      return {
        backgroundColor: "transparent",
        series: [
          {
            type: "pie",
            radius,
            roseType: pieStyle === "rose" ? "area" : undefined,
            padAngle: pieStyle === "donut" ? 5 : 0,
            itemStyle: {
              borderRadius: pieStyle === "donut" || pieStyle === "rose" ? 8 : 0,
            },
            data: data.map((d, i) => ({
              name: String(d[xAxisKey || ""]),
              value: Number(d[series[0]?.dataKey || "value"]) || 0,
              itemStyle: { color: COLORS[i % COLORS.length] },
            })),
            label: { color: textColor },
          },
        ],
        tooltip: { trigger: "item" },
        legend: showLegend
          ? { textStyle: { color: textColor }, bottom: 10 }
          : undefined,
      };
    }

    case "scatter":
      return {
        backgroundColor: "transparent",
        grid: {
          left: 60,
          right: 30,
          top: showLegend ? 50 : 20,
          bottom: 50,
          containLabel: false,
        },
        xAxis: {
          axisLine: { lineStyle: { color: axisLineColor } },
          axisLabel: { color: textColor },
          splitLine: showGrid
            ? { lineStyle: { color: axisLineColor } }
            : { show: false },
        },
        yAxis: {
          axisLine: { lineStyle: { color: axisLineColor } },
          axisLabel: { color: textColor },
          splitLine: showGrid
            ? { lineStyle: { color: axisLineColor } }
            : { show: false },
        },
        series: [
          {
            type: "scatter",
            name: series[0]?.name || series[0]?.dataKey,
            data: data.map((d) => [
              Number(d[xAxisKey || ""]) || 0,
              Number(d[series[0]?.dataKey || ""]) || 0,
            ]),
            symbolSize: 10,
            itemStyle: { color: series[0]?.color || COLORS[0] },
          },
        ],
        tooltip: { trigger: "item" },
        legend: showLegend
          ? { textStyle: { color: textColor }, top: 10 }
          : undefined,
      };

    case "radar":
      return {
        backgroundColor: "transparent",
        radar: {
          indicator: data.map((d) => ({ name: String(d[xAxisKey || ""]) })),
          splitLine: { lineStyle: { color: axisLineColor } },
          axisLine: { lineStyle: { color: axisLineColor } },
          splitArea: { show: false },
        },
        series: series.map((s, i) => ({
          type: "radar",
          name: s.name || s.dataKey,
          data: [
            {
              value: data.map((d) => d[s.dataKey]),
              name: s.name || s.dataKey,
            },
          ],
          itemStyle: { color: s.color || COLORS[i % COLORS.length] },
          areaStyle: { opacity: 0.3 },
        })),
        tooltip: { trigger: "item" },
        legend: showLegend
          ? { textStyle: { color: textColor }, bottom: 10 }
          : undefined,
      };

    case "funnel":
      return {
        backgroundColor: "transparent",
        series: [
          {
            type: "funnel",
            data: data.map((d, i) => ({
              name: String(d[xAxisKey || ""]),
              value: Number(d[series[0]?.dataKey || "value"]) || 0,
              itemStyle: { color: COLORS[i % COLORS.length] },
            })),
            label: { color: textColor },
          },
        ],
        tooltip: { trigger: "item" },
        legend: showLegend
          ? { textStyle: { color: textColor }, bottom: 10 }
          : undefined,
      };

    default:
      return {};
  }
}

/**
 * Render chart to SVG using ECharts
 * Returns the SVG string
 */
export function renderChartToSvg(
  data: Record<string, string | number>[],
  config: ChartConfig,
  width = 600,
  height = 400,
): string {
  try {
    // Create a temporary container
    const container = document.createElement("div");
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    container.style.position = "absolute";
    container.style.left = "-9999px";
    document.body.appendChild(container);

    // Initialize ECharts instance with SVG renderer
    const chartInstance = echarts.init(container, "light", {
      renderer: "svg",
      width,
      height,
    });

    // Set option
    const option = getChartOption(data, config);
    chartInstance.setOption(option);

    // Get SVG string
    const svgStr = chartInstance.renderToSVGString();

    // Clean up
    chartInstance.dispose();
    document.body.removeChild(container);

    return svgStr;
  } catch (error) {
    console.error("Failed to render chart to SVG:", error);
    return "";
  }
}
