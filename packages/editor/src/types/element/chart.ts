import { Descendant } from "slate";

export type ChartType =
  | "line"
  | "bar"
  | "pie"
  | "area"
  | "scatter"
  | "radar"
  | "funnel";

export interface ChartSeries {
  dataKey: string;
  name?: string;
  color?: string;
}

export interface ChartConfig {
  type: ChartType;
  title?: string;
  xAxisKey?: string;
  series: ChartSeries[];
  showLegend?: boolean;
  showGrid?: boolean;
}

export interface ChartElement {
  type: "chart";
  data: Record<string, string | number>[];
  config: ChartConfig;
  children: Descendant[];
}
