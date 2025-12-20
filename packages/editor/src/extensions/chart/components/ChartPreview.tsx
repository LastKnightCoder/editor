import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Funnel,
  FunnelChart,
  LabelList,
} from "recharts";
import type { ChartConfig } from "../../../types";
import useTheme from "../../../hooks/useTheme";

interface ChartPreviewProps {
  data: Record<string, string | number>[];
  config: ChartConfig;
}

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

const ChartPreview: React.FC<ChartPreviewProps> = ({ data, config }) => {
  const { isDark } = useTheme();
  const { type, xAxisKey, series, showLegend, showGrid } = config;

  const axisStyle = {
    stroke: isDark ? "#475569" : "#e5e7eb",
    fontSize: 12,
  };
  const textColor = isDark ? "#94a3b8" : "#6b7280";

  const gridProps = {
    strokeDasharray: "3 3",
    stroke: axisStyle.stroke,
    fill: "none",
  };

  const tooltipStyle = {
    contentStyle: { backgroundColor: isDark ? "#1e293b" : "#fff" },
    cursor: { fill: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)" },
  };

  const renderChart = () => {
    switch (type) {
      case "line":
        return (
          <LineChart data={data}>
            {showGrid && <CartesianGrid {...gridProps} />}
            <XAxis
              dataKey={xAxisKey}
              tick={{ fill: textColor }}
              axisLine={axisStyle}
            />
            <YAxis tick={{ fill: textColor }} axisLine={axisStyle} />
            <Tooltip {...tooltipStyle} />
            {showLegend && <Legend />}
            {series.map((s, i) => (
              <Line
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                name={s.name || s.dataKey}
                stroke={s.color || COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            ))}
          </LineChart>
        );

      case "bar":
        return (
          <BarChart data={data}>
            {showGrid && <CartesianGrid {...gridProps} />}
            <XAxis
              dataKey={xAxisKey}
              tick={{ fill: textColor }}
              axisLine={axisStyle}
            />
            <YAxis tick={{ fill: textColor }} axisLine={axisStyle} />
            <Tooltip {...tooltipStyle} />
            {showLegend && <Legend />}
            {series.map((s, i) => (
              <Bar
                key={s.dataKey}
                dataKey={s.dataKey}
                name={s.name || s.dataKey}
                fill={s.color || COLORS[i % COLORS.length]}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        );

      case "area":
        return (
          <AreaChart data={data}>
            {showGrid && <CartesianGrid {...gridProps} />}
            <XAxis
              dataKey={xAxisKey}
              tick={{ fill: textColor }}
              axisLine={axisStyle}
            />
            <YAxis tick={{ fill: textColor }} axisLine={axisStyle} />
            <Tooltip {...tooltipStyle} />
            {showLegend && <Legend />}
            {series.map((s, i) => (
              <Area
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                name={s.name || s.dataKey}
                fill={s.color || COLORS[i % COLORS.length]}
                stroke={s.color || COLORS[i % COLORS.length]}
                fillOpacity={0.3}
              />
            ))}
          </AreaChart>
        );

      case "pie": {
        const pieDataKey = series[0]?.dataKey || "value";
        return (
          <PieChart>
            <Pie
              data={data}
              dataKey={pieDataKey}
              nameKey={xAxisKey}
              cx="50%"
              cy="50%"
              outerRadius={80}
              label
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip {...tooltipStyle} />
            {showLegend && <Legend />}
          </PieChart>
        );
      }

      case "scatter": {
        // Scatter chart needs numeric X and Y axes
        const scatterYKey = series[0]?.dataKey || "value";
        // If xAxisKey values are not numeric, use index as x
        const hasNumericX =
          data.length > 0 && typeof data[0][xAxisKey || ""] === "number";
        const scatterData = hasNumericX
          ? data
          : data.map((d, i) => ({ ...d, _x: i }));
        const scatterXKey = hasNumericX ? xAxisKey : "_x";
        return (
          <ScatterChart>
            {showGrid && <CartesianGrid {...gridProps} />}
            <XAxis
              type="number"
              dataKey={scatterXKey}
              name={xAxisKey || "x"}
              tick={{ fill: textColor }}
              axisLine={axisStyle}
            />
            <YAxis
              type="number"
              dataKey={scatterYKey}
              name={scatterYKey}
              tick={{ fill: textColor }}
              axisLine={axisStyle}
            />
            <Tooltip {...tooltipStyle} />
            {showLegend && <Legend />}
            <Scatter
              name={series[0]?.name || scatterYKey}
              data={scatterData}
              fill={series[0]?.color || COLORS[0]}
            />
          </ScatterChart>
        );
      }

      case "radar":
        return (
          <RadarChart data={data} cx="50%" cy="50%" outerRadius={80}>
            <PolarGrid stroke={axisStyle.stroke} />
            <PolarAngleAxis dataKey={xAxisKey} tick={{ fill: textColor }} />
            <PolarRadiusAxis tick={{ fill: textColor }} />
            <Tooltip {...tooltipStyle} />
            {showLegend && <Legend />}
            {series.map((s, i) => (
              <Radar
                key={s.dataKey}
                name={s.name || s.dataKey}
                dataKey={s.dataKey}
                stroke={s.color || COLORS[i % COLORS.length]}
                fill={s.color || COLORS[i % COLORS.length]}
                fillOpacity={0.3}
              />
            ))}
          </RadarChart>
        );

      case "funnel": {
        const funnelDataKey = series[0]?.dataKey || "value";
        return (
          <FunnelChart>
            <Tooltip {...tooltipStyle} />
            {showLegend && <Legend />}
            <Funnel dataKey={funnelDataKey} data={data} isAnimationActive>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
              <LabelList
                position="center"
                fill="#fff"
                stroke="none"
                dataKey={xAxisKey}
              />
            </Funnel>
          </FunnelChart>
        );
      }

      default:
        return null;
    }
  };

  return (
    <ResponsiveContainer width="100%" height={300}>
      {renderChart() as React.ReactElement}
    </ResponsiveContainer>
  );
};

export default ChartPreview;
