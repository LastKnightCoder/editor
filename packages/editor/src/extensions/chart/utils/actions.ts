import type * as echarts from "echarts";

import type { ChartElement } from "../../../types";

/** 存储图表组件注册的运行时动作（打开编辑器、取 echarts 实例） */
export const chartActionsMap = new WeakMap<
  ChartElement,
  {
    openEditor: () => void;
    getChartInstance: () => echarts.ECharts | null;
  }
>();

export function downloadChartCsv(data: Record<string, string | number>[]) {
  if (!data.length) return;
  const keys = Object.keys(data[0]);
  const csv = [keys.join(","), ...data.map(row => keys.map(k => row[k] ?? "").join(","))].join(
    "\n"
  );
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "chart-data.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadChartImage(instance: echarts.ECharts | null | undefined) {
  if (!instance) return;
  const url = instance.getDataURL({
    type: "png",
    pixelRatio: 2,
    backgroundColor: "#fff",
  });
  const a = document.createElement("a");
  a.href = url;
  a.download = "chart.png";
  a.click();
}
