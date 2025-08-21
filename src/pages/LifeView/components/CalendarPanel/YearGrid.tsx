import { memo } from "react";

interface YearGridProps {
  centuryStart: number; // e.g. 2000
  selectedYear: number;
  onSelect: (y: number) => void;
}

const YearGrid = memo((props: YearGridProps) => {
  const { selectedYear, onSelect } = props;

  // 显示过去20年至今
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 20;
  const years = Array.from({ length: 21 }).map((_, i) => startYear + i);

  return (
    <div className="w-full">
      {/* 年份范围标题 */}
      <div className="text-center text-lg font-semibold mb-4">
        {startYear}年 - {currentYear}年
      </div>

      <div className="grid grid-cols-7 gap-1">
        {years.map((y) => {
          const isSelected = y === selectedYear;

          return (
            <div
              key={y}
              onClick={() => onSelect(y)}
              className={`aspect-square cursor-pointer rounded-lg flex items-center justify-center transition-all duration-200 text-xs font-medium ${
                !isSelected ? "hover:bg-gray-100 dark:hover:bg-gray-700" : ""
              } ${isSelected ? "bg-blue-500 text-white" : "bg-transparent"}`}
            >
              {y % 100}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default YearGrid;
