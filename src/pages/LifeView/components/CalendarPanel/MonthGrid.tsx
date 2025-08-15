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
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "0.5em",
      }}
    >
      {months.map((m) => {
        const isSelected =
          m.month() === selectedMonthAnchor.month() &&
          m.year() === selectedMonthAnchor.year();
        return (
          <div
            key={m.month()}
            onClick={() => onSelect(m)}
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
            {m.format("YYYY-MM")}
          </div>
        );
      })}
    </div>
  );
});

export default MonthGrid;
