import { memo } from "react";
import { Dayjs } from "dayjs";

interface WeekGridProps {
  yearAnchor: Dayjs; // 任意该年的日期
  selectedWeekStart: Dayjs; // 该周周一
  onSelect: (weekStart: Dayjs) => void;
}

const WeekGrid = memo((props: WeekGridProps) => {
  const { yearAnchor, selectedWeekStart, onSelect } = props;

  const start = yearAnchor.startOf("year").startOf("week");
  const end = yearAnchor.endOf("year").endOf("week");

  const weeks: Dayjs[] = [];
  let cur = start;
  while (cur.isBefore(end)) {
    weeks.push(cur);
    cur = cur.add(1, "week");
  }

  return (
    <div className="w-full">
      {/* 年份标题 */}
      <div className="text-center text-lg font-semibold mb-4">
        {yearAnchor.format("YYYY年")}
      </div>

      <div className="grid grid-cols-9 gap-1">
        {weeks.map((w) => {
          const weekNum = w.week();
          const isSelected = w.isSame(selectedWeekStart, "week");

          return (
            <div
              key={w.valueOf()}
              onClick={() => onSelect(w)}
              className={`aspect-square cursor-pointer rounded-lg flex items-center justify-center transition-all duration-200 text-sm font-medium ${
                !isSelected ? "hover:bg-gray-100 dark:hover:bg-gray-700" : ""
              } ${isSelected ? "bg-blue-500 text-white" : "bg-transparent"}`}
            >
              {weekNum}周
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default WeekGrid;
