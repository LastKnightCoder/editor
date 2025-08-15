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
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(6, 1fr)",
        gap: "0.5em",
      }}
    >
      {weeks.map((w) => {
        const weekNum = w.week();
        const isSelected = w.isSame(selectedWeekStart, "week");
        return (
          <div
            key={w.valueOf()}
            onClick={() => onSelect(w)}
            style={{
              padding: "0.75em",
              borderRadius: 8,
              cursor: "pointer",
              border: isSelected
                ? "2px solid var(--primary-color)"
                : "1px solid var(--line-color)",
              minHeight: "3.5em",
            }}
          >
            第{weekNum}周
          </div>
        );
      })}
    </div>
  );
});

export default WeekGrid;
