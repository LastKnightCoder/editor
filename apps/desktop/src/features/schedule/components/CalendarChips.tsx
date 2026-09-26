/**
 * 工具条日历 chips（方案 C 取代内层侧栏）：点 chip 切显隐；
 * 右端「管理日历」开 Dialog，内容即完整日历清单（分组 / 新建 / 编辑 / 归档 / 删除 / 合并）。
 */

import { useState } from "react";
import { Plus, SlidersHorizontal } from "lucide-react";
import { Button, Dialog, DialogBody, IconButton, Tooltip, cn } from "@tau/ui";
import useCalendarStore from "@/stores/useCalendarStore";
import { TONE, toneStyle } from "../eventTone";
import CalendarSidebar from "./CalendarSidebar";

export function CalendarChips() {
  const calendars = useCalendarStore(s => s.calendars);
  const selectedCalendarIds = useCalendarStore(s => s.selectedCalendarIds);
  const toggleCalendarVisibility = useCalendarStore(s => s.toggleCalendarVisibility);
  const [managing, setManaging] = useState(false);

  // 我的日历在前、系统日历在后；归档不出现在筛选里
  const active = calendars
    .filter(c => !c.archived)
    .sort((a, b) => Number(a.isInSystemGroup ?? false) - Number(b.isInSystemGroup ?? false));
  const hasUserCalendar = active.some(c => !c.isInSystemGroup);

  return (
    <div className="flex flex-none flex-wrap items-center gap-1.5 pb-3">
      {!hasUserCalendar && (
        <>
          <span className="text-ink-3 text-tau-meta">还没有日历</span>
          <Button variant="ghost" size="sm" icon={Plus} onClick={() => setManaging(true)}>
            新建日历
          </Button>
        </>
      )}
      {active.map(calendar => {
        const on = selectedCalendarIds.includes(calendar.id);
        return (
          <button
            key={calendar.id}
            type="button"
            aria-pressed={on}
            title={on ? `隐藏「${calendar.title}」` : `显示「${calendar.title}」`}
            onClick={() => void toggleCalendarVisibility(calendar.id)}
            style={toneStyle(calendar.color)}
            className={cn(
              "text-tau-sm inline-flex h-[26px] items-center gap-1.5 rounded-full pl-2 pr-2.5 transition-colors",
              "outline-none focus-visible:shadow-[var(--tau-focus-ring)]",
              on
                ? "border-line-1 bg-surface text-ink-1 hover:bg-surface-hover border"
                : "text-ink-3 hover:bg-hover border border-transparent",
              TONE
            )}
          >
            <i
              className={cn(
                "size-2 rounded-full",
                on ? "bg-[var(--cal)]" : "shadow-[inset_0_0_0_1.5px_var(--cal)]"
              )}
            />
            {calendar.title}
          </button>
        );
      })}
      <Tooltip content="管理日历">
        <IconButton aria-label="管理日历" onClick={() => setManaging(true)}>
          <SlidersHorizontal className="size-4" strokeWidth={1.75} />
        </IconButton>
      </Tooltip>

      <Dialog
        open={managing}
        onOpenChange={setManaging}
        title="管理日历"
        subtitle="分组、新建、归档与合并；勾选框控制是否在日程中显示"
        width={420}
      >
        <DialogBody>
          <div className="-mx-1 flex max-h-[60vh] flex-col">
            <CalendarSidebar />
          </div>
        </DialogBody>
      </Dialog>
    </div>
  );
}
