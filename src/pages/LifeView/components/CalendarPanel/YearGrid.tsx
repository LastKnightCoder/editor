import { memo } from "react";

interface YearGridProps {
  centuryStart: number; // e.g. 2000
  selectedYear: number;
  onSelect: (y: number) => void;
}

const YearGrid = memo((props: YearGridProps) => {
  const { centuryStart, selectedYear, onSelect } = props;
  const years = Array.from({ length: 100 }).map((_, i) => centuryStart + i);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(10, 1fr)",
        gap: "0.5em",
        maxHeight: "100%",
        overflow: "auto",
      }}
    >
      {years.map((y) => {
        const isSelected = y === selectedYear;
        return (
          <div
            key={y}
            onClick={() => onSelect(y)}
            style={{
              padding: "0.5em 0.75em",
              borderRadius: 8,
              cursor: "pointer",
              border: isSelected
                ? "2px solid var(--primary-color)"
                : "1px solid var(--line-color)",
            }}
          >
            {y}
          </div>
        );
      })}
    </div>
  );
});

export default YearGrid;
