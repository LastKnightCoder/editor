import React from "react";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";

interface MiniBarChartProps {
  data: number[];
  height?: number;
  className?: string;
}

const MiniBarChart: React.FC<MiniBarChartProps> = ({
  data,
  height = 60,
  className,
}) => {
  const themeColors = useThemeColors();

  if (!data || data.length === 0) {
    return null;
  }

  const maxValue = Math.max(...data, 1);
  const barWidth = 100 / data.length;

  return (
    <div className={classNames("w-full", className)} style={{ height }}>
      <svg width="100%" height="100%" className="overflow-visible">
        {data.map((value, index) => {
          const barHeight = (value / maxValue) * height;
          const x = index * barWidth;
          const y = height - barHeight;

          return (
            <rect
              key={index}
              x={`${x}%`}
              y={y}
              width={`${barWidth * 0.8}%`}
              height={barHeight}
              fill="currentColor"
              className="transition-all duration-300"
              style={{ color: themeColors.accentColor }}
              rx="2"
            />
          );
        })}
      </svg>
    </div>
  );
};

export default MiniBarChart;
