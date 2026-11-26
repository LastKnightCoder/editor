/**
 * 工具条日历 chips（取代内层侧栏）：点 chip 切显隐；
 * 右端「管理日历」开 Dialog，内容即完整日历清单（分组 / 新建 / 编辑 / 归档 / 删除 / 合并）。
 */

import { scheduleText, scheduleValue, useScheduleI18n } from "../i18n";
import { useState } from "react";
import { Plus, SlidersHorizontal } from "lucide-react";
import { Button, Dialog, DialogBody, IconButton, Tooltip, cn, toast } from "@tau/ui";
import { useCalendarCatalog, useScheduleMutations } from "../queries";
import { TONE, toneStyle } from "../eventTone";
import CalendarSidebar from "./CalendarSidebar";

export function CalendarChips() {
  useScheduleI18n();

  const { calendars } = useCalendarCatalog();
  const { toggleCalendarVisibility } = useScheduleMutations();
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
          <span className="text-ink-3 text-tau-meta">{scheduleText("calendar.noneYet")}</span>
          <Button variant="ghost" size="sm" icon={Plus} onClick={() => setManaging(true)}>
            {scheduleText("calendar.create")}
          </Button>
        </>
      )}
      {active.map(calendar => {
        const on = calendar.visible;
        return (
          <button
            key={calendar.id}
            type="button"
            aria-pressed={on}
            title={
              on
                ? scheduleText("calendar.hideNamed", { title: scheduleValue(calendar.title) })
                : scheduleText("calendar.showQuoted", { title: scheduleValue(calendar.title) })
            }
            onClick={() =>
              void toggleCalendarVisibility(calendar.id).catch(() =>
                toast.error(scheduleText("feedback.visibilityFailed"))
              )
            }
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
      <Tooltip content={scheduleText("calendar.manage")}>
        <IconButton aria-label={scheduleText("calendar.manage")} onClick={() => setManaging(true)}>
          <SlidersHorizontal className="size-4" strokeWidth={1.75} />
        </IconButton>
      </Tooltip>

      <Dialog
        open={managing}
        onOpenChange={setManaging}
        title={scheduleText("calendar.manage")}
        subtitle={scheduleText("calendar.manageHint")}
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
