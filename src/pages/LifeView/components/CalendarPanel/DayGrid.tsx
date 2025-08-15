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

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
        gap: "0.5em",
      }}
    >
      {days.map((d) => {
        const isOtherMonth = d.month() !== monthAnchor.month();
        const isSelected = d.isSame(selectedDate, "day");
        const counts = getCounts?.(d);
        return (
          <div
            key={d.valueOf()}
            onClick={() => onSelect(d)}
            style={{
              padding: "0.75em",
              borderRadius: 8,
              cursor: "pointer",
              border: isSelected
                ? "2px solid var(--primary-color)"
                : "1px solid var(--line-color)",
              opacity: isOtherMonth ? 0.5 : 1,
              position: "relative",
              minHeight: "4.5em",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: "0.5em" }}>
              {d.date()}
            </div>
            {/* 徽标：右上角记录数，左下角日志数 */}
            {counts && counts.records > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "0.3em",
                  right: "0.4em",
                  fontSize: "0.75em",
                  padding: "0 0.5em",
                  lineHeight: "1.6em",
                  background: "var(--common-hover-bg)",
                  borderRadius: 999,
                }}
              >
                {counts.records}
              </div>
            )}
            {counts && counts.logs > 0 && (
              <div
                style={{
                  position: "absolute",
                  bottom: "0.3em",
                  left: "0.4em",
                  fontSize: "0.75em",
                  padding: "0 0.5em",
                  lineHeight: "1.6em",
                  background: "var(--common-hover-bg)",
                  borderRadius: 999,
                }}
              >
                {counts.logs}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

export default DayGrid;
