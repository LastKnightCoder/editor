// 日历选择 BottomSheet（定稿 D-①）：系统日历展示但禁选（徽章标注），
// 用户日历带事件归属分组排序；选中项打勾。

import { BottomSheet } from "../../../components/BottomSheet";
import { useThemeStore } from "@tau/themes/react";
import { calendarColorValue } from "../constants";
import type { Calendar } from "../types";

type CalendarPickerSheetProps = {
  open: boolean;
  calendars: Calendar[];
  selectedId: number | null;
  onSelect: (calendarId: number) => void;
  onClose: () => void;
};

export function CalendarPickerSheet({
  open,
  calendars,
  selectedId,
  onSelect,
  onClose,
}: CalendarPickerSheetProps) {
  const isDark = useThemeStore(s => s.mode === "dark");
  const selectable = calendars.filter(calendar => !calendar.archived);
  return (
    <BottomSheet open={open} title="选择日历" onClose={onClose}>
      <div className="max-h-[380px] overflow-y-auto pb-2">
        {selectable.map(calendar => {
          const selected = calendar.id === selectedId;
          return (
            <button
              key={calendar.id}
              type="button"
              disabled={calendar.isInSystemGroup}
              onClick={() => {
                onSelect(calendar.id);
                onClose();
              }}
              className={`flex w-full items-center gap-3 rounded-[14px] px-1.5 py-[13px] text-left ${
                calendar.isInSystemGroup ? "opacity-60" : "active:bg-page"
              }`}
            >
              <i
                className="h-[13px] w-[13px] flex-none rounded-full"
                style={{ background: calendarColorValue(calendar.color, isDark) }}
              />
              <span
                className={`flex-1 text-[14.5px] font-bold ${
                  calendar.isInSystemGroup ? "text-ink-2" : "text-ink-1"
                }`}
              >
                {calendar.title}
              </span>
              {calendar.isInSystemGroup ? (
                <span className="bg-page text-ink-3 rounded-full px-2 py-0.5 text-[10px] font-extrabold">
                  系统
                </span>
              ) : null}
              {selected ? <span className="text-accent text-[16px] font-extrabold">✓</span> : null}
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}
