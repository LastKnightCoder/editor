import { memo } from "react";
import { Dayjs } from "dayjs";

interface MonthGridProps {
  yearAnchor: Dayjs;
  selectedMonthAnchor: Dayjs;
  onSelect: (d: Dayjs) => void;
}

const MonthGrid = memo((props: MonthGridProps) => {
  const { yearAnchor, selectedMonthAnchor, onSelect } = props;

  const months = Array.from({ length: 12 }).map((_, i) => yearAnchor.month(i));

  return (
    <div className="w-full">
      {/* 年份标题 */}
      <div className="text-center text-lg font-semibold mb-4">
        {yearAnchor.format("YYYY年")}
      </div>

      <div className="grid grid-cols-4 gap-1">
        {months.map((m) => {
          const isSelected =
            m.month() === selectedMonthAnchor.month() &&
            m.year() === selectedMonthAnchor.year();

          return (
            <div
              key={m.month()}
              onClick={() => onSelect(m)}
              className={`aspect-square cursor-pointer rounded-lg flex items-center justify-center transition-all duration-200 text-sm font-medium ${
                !isSelected ? "hover:bg-gray-100 dark:hover:bg-gray-700" : ""
              } ${isSelected ? "bg-blue-500 text-white" : "bg-transparent"}`}
            >
              {m.format("M月")}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default MonthGrid;
