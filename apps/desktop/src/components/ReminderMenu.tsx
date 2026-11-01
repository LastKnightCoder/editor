import type { ReactElement } from "react";
import { Menu } from "@tau/ui";
import {
  MAX_REMINDERS,
  normalizeReminders,
  reminderLabel,
  reminderPresets,
} from "@tau/shared/reminders";

interface ReminderMenuProps {
  trigger: ReactElement;
  value: readonly number[];
  onChange: (offsets: number[]) => void;
  /** 全天日程用「当天 / 前一天 + 时刻」预设 */
  allDay?: boolean;
}

/** 提醒多选（最多 MAX_REMINDERS 个）：勾选项不关闭菜单，便于连选 */
export function ReminderMenu({ trigger, value, onChange, allDay = false }: ReminderMenuProps) {
  const selected = new Set(value);
  const full = selected.size >= MAX_REMINDERS;
  const toggle = (offset: number, checked: boolean) =>
    onChange(
      normalizeReminders(checked ? [...value, offset] : value.filter(item => item !== offset))
    );
  // 预设之外的已有值（旧档位或 AI 写入的任意时刻）也列出来，才能取消
  const presets = reminderPresets(allDay);
  const others = value
    .filter(offset => !presets.some(preset => preset.offset === offset))
    .map(offset => ({ offset, label: reminderLabel(offset, allDay) }));
  return (
    <Menu trigger={trigger}>
      {[...presets, ...others].map(preset => (
        <Menu.CheckboxItem
          key={preset.offset}
          checked={selected.has(preset.offset)}
          disabled={full && !selected.has(preset.offset)}
          onCheckedChange={checked => toggle(preset.offset, checked)}
        >
          {preset.label}
        </Menu.CheckboxItem>
      ))}
      {value.length > 0 && (
        <>
          <Menu.Separator />
          <Menu.Item onSelect={() => onChange([])}>不提醒</Menu.Item>
        </>
      )}
    </Menu>
  );
}
