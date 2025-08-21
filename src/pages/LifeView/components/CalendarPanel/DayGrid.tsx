import { memo } from "react";
import { Dayjs } from "dayjs";

interface DayGridProps {
  monthAnchor: Dayjs; // 任意该月的日期
  selectedDate: Dayjs;
  onSelect: (d: Dayjs) => void;
  // 右上角与左下角徽标：时间记录数、日志数
  getCounts?: (d: Dayjs) => { records: number; logs: number } | undefined;
}

const DayGrid = memo((props: DayGridProps) => {
  const { monthAnchor, selectedDate, onSelect, getCounts } = props;

  const startOfMonth = monthAnchor.startOf("month");
  const endOfMonth = monthAnchor.endOf("month");
  // 从该月第一天所在周的周一开始，到最后一天所在周的周日结束
  const start = startOfMonth.startOf("week");
  const end = endOfMonth.endOf("week");

  const days: Dayjs[] = [];
  let cur = start;
  while (cur.isBefore(end) || cur.isSame(end)) {
    days.push(cur);
    cur = cur.add(1, "day");
  }

  // 周几标题（从周一开始）
  const weekDayLabels = ["一", "二", "三", "四", "五", "六", "日"];

  return (
    <div className="w-full">
      {/* 年月标题 */}
      <div className="text-center text-lg font-semibold mb-4">
        {monthAnchor.format("YYYY年M月")}
      </div>

      {/* 周几标题行 */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDayLabels.map((label, index) => (
          <div
            key={index}
            className="aspect-square flex items-center justify-center text-sm font-medium text-gray-600 dark:text-gray-400"
          >
            {label}
          </div>
        ))}
      </div>

      {/* 日期格子 */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const isOtherMonth = d.month() !== monthAnchor.month();
          const isSelected = d.isSame(selectedDate, "day");
          const counts = getCounts?.(d);

          return (
            <div
              key={d.valueOf()}
              onClick={() => onSelect(d)}
              className={`aspect-square cursor-pointer rounded-lg flex items-center justify-center p-2 transition-all duration-200 relative ${
                !isSelected ? "hover:bg-gray-100 dark:hover:bg-gray-700" : ""
              } ${
                isSelected ? "bg-blue-500 text-white" : "bg-transparent"
              } ${isOtherMonth ? "opacity-30" : "opacity-100"}`}
            >
              <div className="font-medium text-sm">{d.date()}</div>

              {/* 日志徽标：右上角蓝色圆形小角标（选中状态时不显示，避免看不清） */}
              {counts && counts.logs > 0 && !isSelected && (
                <div className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default DayGrid;
