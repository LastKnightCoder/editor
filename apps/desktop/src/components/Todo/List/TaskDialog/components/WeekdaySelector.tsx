import { FC } from "react";

interface WeekdaySelectorProps {
  value: number[];
  onChange: (weekdays: number[]) => void;
}

const WEEKDAYS = [
  { value: 0, label: "日" },
  { value: 1, label: "一" },
  { value: 2, label: "二" },
  { value: 3, label: "三" },
  { value: 4, label: "四" },
  { value: 5, label: "五" },
  { value: 6, label: "六" },
];

const WeekdaySelector: FC<WeekdaySelectorProps> = ({ value, onChange }) => {
  const handleToggle = (day: number) => {
    if (value.includes(day)) {
      onChange(value.filter((d) => d !== day));
    } else {
      onChange([...value, day].sort());
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
        重复日期
      </label>
      <div className="flex gap-2">
        {WEEKDAYS.map((day) => {
          const isSelected = value.includes(day.value);
          return (
            <button
              key={day.value}
              type="button"
              onClick={() => handleToggle(day.value)}
              className={`flex-1 h-10 rounded-lg text-sm font-medium transition-all ${
                isSelected
                  ? "bg-indigo-500 text-white shadow-md"
                  : "bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-zinc-700"
              }`}
            >
              {day.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default WeekdaySelector;
