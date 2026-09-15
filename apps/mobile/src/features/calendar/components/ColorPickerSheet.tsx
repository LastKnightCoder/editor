// 颜色选择 BottomSheet（定稿 D-②）：17 色数据色板 + 「跟随日历」入口；
// 玄夜主题自动切 dark 色值，选中项用品牌色 ring + 底色间隙标注。

import { Check } from "lucide-react";
import { BottomSheet } from "../../../components/BottomSheet";
import { useMobileTheme } from "../../../hooks/useMobileTheme";
import { CALENDAR_COLORS, calendarColorValue } from "../constants";

type ColorPickerSheetProps = {
  open: boolean;
  /** null = 跟随日历 */
  selected: string | null;
  calendarColor: string | null;
  onSelect: (color: string | null) => void;
  onClose: () => void;
};

export function ColorPickerSheet({
  open,
  selected,
  calendarColor,
  onSelect,
  onClose,
}: ColorPickerSheetProps) {
  const { isDark } = useMobileTheme();
  return (
    <BottomSheet open={open} title="日程颜色" onClose={onClose}>
      <div className="grid grid-cols-6 gap-3.5 px-1 pt-1">
        {CALENDAR_COLORS.map(entry => {
          const value = calendarColorValue(entry.name, isDark);
          const isSelected = selected === entry.name;
          return (
            <button
              key={entry.name}
              type="button"
              aria-label={entry.label}
              aria-pressed={isSelected}
              onClick={() => {
                onSelect(entry.name);
                onClose();
              }}
              // 选中态用品牌色 ring + 面板底色 offset 留出间隙（与日记标签色板同一套），
              // 定稿里的 ink 描边在四套主题下都是近黑/近白的中性色，看着像选中框跑错了主题
              className={`grid aspect-square place-items-center rounded-full text-[13px] font-extrabold text-white ${
                isSelected ? "ring-accent ring-offset-surface ring-2 ring-offset-2" : ""
              }`}
              style={{ background: value }}
            >
              {isSelected ? <Check size={14} strokeWidth={3} aria-hidden /> : null}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between pt-4">
        <span className="text-ink-3 text-[11.5px] font-semibold">
          与桌面端同一套 17 色 · 主题自动切换
        </span>
        <button
          type="button"
          onClick={() => {
            onSelect(null);
            onClose();
          }}
          className="text-accent text-[13.5px] font-extrabold"
        >
          跟随日历{calendarColor ? " ›" : ""}
        </button>
      </div>
    </BottomSheet>
  );
}
