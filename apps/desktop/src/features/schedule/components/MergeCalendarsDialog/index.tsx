/**
 * 合并日历：源日历（带日程数，可移除）→ 选目标日历 → 二次确认 → Toast 结果。
 * 流程与 store action 与 legacy 一致；只换 tau Dialog / ConfirmDialog / Toast 皮。
 */

import { memo, useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { Button, ConfirmDialog, Dialog, DialogBody, IconButton, cn, toast } from "@tau/ui";
import useCalendarStore from "@/stores/useCalendarStore";
import { getEventsByCalendarId } from "@/commands";
import { TONE, toneStyle } from "../../eventTone";

interface MergeCalendarsDialogProps {
  open: boolean;
  onClose: () => void;
  sourceCalendarIds: number[];
}

const MergeCalendarsDialog = memo(
  ({ open, onClose, sourceCalendarIds }: MergeCalendarsDialogProps) => {
    const calendars = useCalendarStore(s => s.calendars);
    const calendarGroups = useCalendarStore(s => s.calendarGroups);
    const { mergeCalendars, toggleCalendarForMerge } = useCalendarStore.getState();

    const [targetCalendarId, setTargetCalendarId] = useState<number | null>(null);
    const [eventCounts, setEventCounts] = useState<Record<number, number>>({});
    const [confirming, setConfirming] = useState(false);

    const sourceCalendars = calendars.filter(c => sourceCalendarIds.includes(c.id));
    const targetCalendars = calendars.filter(
      c => !sourceCalendarIds.includes(c.id) && !c.isInSystemGroup && !c.archived
    );
    const totalEvents = sourceCalendarIds.reduce((sum, id) => sum + (eventCounts[id] ?? 0), 0);

    // 加载各源日历的日程数
    useEffect(() => {
      if (!open || sourceCalendarIds.length === 0) return;
      let cancelled = false;
      Promise.all(
        sourceCalendarIds.map(id =>
          getEventsByCalendarId(id)
            .then(events => [id, events.length] as const)
            .catch(() => [id, 0] as const)
        )
      ).then(entries => {
        if (!cancelled) setEventCounts(Object.fromEntries(entries));
      });
      return () => {
        cancelled = true;
      };
    }, [open, sourceCalendarIds]);

    useEffect(() => {
      if (!open) setTargetCalendarId(null);
    }, [open]);

    const target = calendars.find(c => c.id === targetCalendarId);

    return (
      <>
        <Dialog
          open={open}
          onOpenChange={next => {
            if (!next) onClose();
          }}
          title="合并日历"
          subtitle={`${sourceCalendars.length} 个日历 · 共 ${totalEvents} 项日程`}
          size="lg"
          impact="合并后源日历会被删除，日程全部转移到目标日历"
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={onClose}>
                取消
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!targetCalendarId || sourceCalendars.length === 0}
                onClick={() => setConfirming(true)}
              >
                合并
              </Button>
            </>
          }
        >
          <DialogBody>
            <div className="flex flex-col gap-4">
              <section className="flex flex-col gap-1">
                <span className="text-ink-2 text-[12px]">要合并的日历</span>
                {sourceCalendars.map(calendar => (
                  <div
                    key={calendar.id}
                    style={toneStyle(calendar.color)}
                    className={cn("flex h-8 items-center gap-2.5 rounded-[8px] px-2", TONE)}
                  >
                    <i className="size-2.5 rounded-[3px] bg-[var(--cal)]" />
                    <span className="text-tau-body flex-1">{calendar.title}</span>
                    <span className="text-ink-3 font-tau-mono text-[11.5px]">
                      {eventCounts[calendar.id] ?? "…"} 项
                    </span>
                    <IconButton
                      className="size-6"
                      title="移出合并"
                      aria-label={`移出 ${calendar.title}`}
                      onClick={() => toggleCalendarForMerge(calendar.id)}
                    >
                      <X className="size-3.5" strokeWidth={1.75} />
                    </IconButton>
                  </div>
                ))}
              </section>

              <section className="flex flex-col gap-1">
                <span className="text-ink-2 text-[12px]">合并到</span>
                {targetCalendars.length === 0 ? (
                  <p className="border-line-1 text-ink-3 text-tau-meta rounded-[10px] border px-3 py-4 text-center">
                    没有可用的目标日历
                  </p>
                ) : (
                  <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
                    {targetCalendars.map(calendar => {
                      const selected = targetCalendarId === calendar.id;
                      const group = calendarGroups.find(g => g.id === calendar.groupId);
                      return (
                        <button
                          key={calendar.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setTargetCalendarId(calendar.id)}
                          style={toneStyle(calendar.color)}
                          className={cn(
                            "flex h-8 items-center gap-2.5 rounded-[8px] px-2 text-left",
                            selected ? "bg-selected" : "hover:bg-hover",
                            TONE
                          )}
                        >
                          <i className="size-2.5 rounded-[3px] bg-[var(--cal)]" />
                          <span className="text-tau-body">{calendar.title}</span>
                          {group && <span className="text-ink-3 text-tau-sm">{group.name}</span>}
                          <span className="flex-1" />
                          {selected && (
                            <Check className="text-accent-text size-4" strokeWidth={2} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </DialogBody>
        </Dialog>

        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          danger
          title="确认合并"
          context={target?.title}
          description={`将 ${sourceCalendars.length} 个日历（共 ${totalEvents} 项日程）合并到「${target?.title ?? ""}」，源日历将被删除。`}
          impact="此操作不可撤销"
          confirmText="合并"
          onConfirm={async () => {
            if (!targetCalendarId) return;
            try {
              const result = await mergeCalendars(sourceCalendarIds, targetCalendarId);
              toast.success(
                `已合并 ${result.deletedCalendars} 个日历，转移 ${result.transferredEvents} 项日程`
              );
              setConfirming(false);
              onClose();
            } catch (error) {
              console.error("Failed to merge calendars:", error);
              toast.error(error instanceof Error ? error.message : "合并日历失败，请重试");
            }
          }}
        />
      </>
    );
  }
);

MergeCalendarsDialog.displayName = "MergeCalendarsDialog";

export default MergeCalendarsDialog;
