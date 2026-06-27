import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import dayjs from "dayjs";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import useThemeColors from "@/hooks/useThemeColors";
import useSettingStore from "@/stores/useSettingStore";

function colorWithAlpha(color: string, alpha: number): string {
  if (color.startsWith("#")) {
    const normalized =
      color.length === 4
        ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
        : color;
    const r = parseInt(normalized.slice(1, 3), 16);
    const g = parseInt(normalized.slice(3, 5), 16);
    const b = parseInt(normalized.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (color.startsWith("rgb(")) {
    return color.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
  }
  if (color.startsWith("hsl(")) {
    return color.replace("hsl(", "hsla(").replace(")", `, ${alpha})`);
  }
  return color;
}

type AnchorPositionStyle = CSSProperties & {
  anchorName?: string;
  positionAnchor?: string;
};

type PopoverDivElement = HTMLDivElement & {
  showPopover?: () => void;
  hidePopover?: () => void;
};

function getCalendarDays(viewDate: dayjs.Dayjs): dayjs.Dayjs[] {
  const startDate = viewDate.startOf("month").startOf("week");
  const endDate = viewDate.endOf("month").endOf("week");
  const days: dayjs.Dayjs[] = [];
  let current = startDate;
  while (current.isBefore(endDate) || current.isSame(endDate, "day")) {
    days.push(current);
    current = current.add(1, "day");
  }
  return days;
}

export interface DatePickerProps {
  value: string;
  placeholder?: string;
  accentColor?: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  children?: (display: ReactNode) => ReactNode;
}

const DatePicker = ({
  value,
  placeholder = "选择日期",
  accentColor,
  onChange,
  className,
  disabled = false,
  children,
}: DatePickerProps) => {
  const themeColors = useThemeColors();
  const isDarkMode = useSettingStore((state) => state.setting.darkMode);
  const rawId = useId();
  const anchorName = `--date-picker-${rawId.replace(/[^a-zA-Z0-9-]/g, "")}`;
  const popoverRef = useRef<PopoverDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() =>
    value ? dayjs(value) : dayjs(),
  );

  const accent = accentColor || themeColors.accentColor || "#1890ff";
  const selectedDate = value ? dayjs(value) : null;
  const today = dayjs();
  const calendarDays = getCalendarDays(viewDate);

  const handleOpen = () => {
    if (disabled) return;
    if (value) setViewDate(dayjs(value));
    popoverRef.current?.showPopover?.();
  };

  const handleChange = (next: string) => {
    onChange(next);
    popoverRef.current?.hidePopover?.();
  };

  const display = value ? dayjs(value).format("YYYY年M月D日") : placeholder;

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className={
          className ??
          "flex h-10 w-full min-w-0 items-center justify-between rounded-lg border px-3 text-left transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        }
        style={
          {
            anchorName,
            borderColor: isOpen ? accent : "var(--th-card-border)",
            background: isOpen
              ? colorWithAlpha(accent, 0.1)
              : isDarkMode
                ? "rgba(255, 255, 255, 0.06)"
                : "var(--th-input-bg)",
            color: value ? "var(--th-text)" : "var(--th-text-secondary)",
          } as AnchorPositionStyle
        }
      >
        {children ? (
          children(display)
        ) : (
          <>
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium">
                {display}
              </span>
            </span>
            <Calendar className="ml-2 h-3.5 w-3.5 flex-shrink-0" />
          </>
        )}
      </button>

      <div
        ref={popoverRef}
        popover="auto"
        className="absolute z-40 m-0 w-[300px] rounded-xl border p-2 shadow-[0_18px_45px_rgba(15,23,42,0.16)] backdrop:bg-transparent"
        style={
          {
            positionAnchor: anchorName,
            top: "anchor(bottom)",
            left: "anchor(left)",
            marginTop: 8,
            borderColor: "var(--th-card-border)",
            background: "var(--th-modal)",
          } as AnchorPositionStyle
        }
        onClick={(event) => event.stopPropagation()}
        onToggle={(event) => {
          setIsOpen(
            (event.currentTarget as HTMLElement).matches(":popover-open"),
          );
        }}
      >
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setViewDate(viewDate.subtract(1, "month"))}
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/10"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <div
            className="text-xs font-semibold"
            style={{ color: "var(--th-text)" }}
          >
            {viewDate.format("YYYY年M月")}
          </div>
          <button
            type="button"
            onClick={() => setViewDate(viewDate.add(1, "month"))}
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/10"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div
          className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-medium"
          style={{ color: "var(--th-text-secondary)" }}
        >
          {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
            <div key={day} className="py-1">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day) => {
            const isCurrentMonth = day.month() === viewDate.month();
            const isSelected = selectedDate?.isSame(day, "day") ?? false;
            const isToday = day.isSame(today, "day");
            return (
              <button
                key={day.format("YYYY-MM-DD")}
                type="button"
                onClick={() => handleChange(day.format("YYYY-MM-DD"))}
                className="flex h-7 items-center justify-center rounded-lg text-[11px] transition-all active:scale-95"
                style={{
                  background: isSelected
                    ? accent
                    : isToday
                      ? colorWithAlpha(accent, 0.12)
                      : "transparent",
                  border:
                    isToday && !isSelected
                      ? `1px solid ${colorWithAlpha(accent, 0.45)}`
                      : "1px solid transparent",
                  color: isSelected
                    ? "#ffffff"
                    : isCurrentMonth
                      ? "var(--th-text)"
                      : "var(--th-text-secondary)",
                  opacity: isCurrentMonth || isSelected ? 1 : 0.45,
                  fontWeight: isSelected || isToday ? 600 : 400,
                }}
              >
                {day.date()}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => {
            const nextToday = dayjs();
            setViewDate(nextToday);
            handleChange(nextToday.format("YYYY-MM-DD"));
          }}
          className="mt-2 h-8 w-full rounded-lg text-xs font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/10"
          style={{ color: accent }}
        >
          今天
        </button>
      </div>
    </>
  );
};

export default DatePicker;
