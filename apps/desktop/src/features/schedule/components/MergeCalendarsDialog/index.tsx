/**
 * 合并日历：源日历（带日程数，可移除）→ 选目标日历 → 二次确认 → Toast 结果。
 * 日程数量由主进程聚合，合并写入经日程域 mutation。
 */

import { scheduleText, scheduleValue, scheduleErrorText, useScheduleI18n } from "../../i18n";
import { memo, useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { Button, ConfirmDialog, Dialog, DialogBody, IconButton, cn, toast } from "@tau/ui";
import { useQuery } from "@tanstack/react-query";
import { databaseQueryKey } from "@/services/command-context";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import { useScheduleStore } from "../../uiStore";
import {
  scheduleKeys,
  useCalendarCatalog,
  useScheduleCommands,
  useScheduleMutations,
} from "../../queries";
import { TONE, toneStyle } from "../../eventTone";

interface MergeCalendarsDialogProps {
  open: boolean;
  onClose: () => void;
  sourceCalendarIds: number[];
}

const MergeCalendarsDialog = memo(
  ({ open, onClose, sourceCalendarIds }: MergeCalendarsDialogProps) => {
    useScheduleI18n();

    const { calendars, calendarGroups } = useCalendarCatalog();
    const { mergeCalendars } = useScheduleMutations();
    const toggleCalendarForMerge = useScheduleStore(s => s.toggleCalendarForMerge);
    const { database, commands, connectionId } = useScheduleCommands();
    const connected = useDatabaseConnected();

    const [targetCalendarId, setTargetCalendarId] = useState<number | null>(null);
    const [confirming, setConfirming] = useState(false);

    const sourceCalendars = calendars.filter(c => sourceCalendarIds.includes(c.id));
    const targetCalendars = calendars.filter(
      c => !sourceCalendarIds.includes(c.id) && !c.isInSystemGroup && !c.archived
    );

    const countsQuery = useQuery({
      queryKey: databaseQueryKey(
        [...scheduleKeys.root(database), "merge-counts", sourceCalendarIds],
        connectionId
      ),
      queryFn: () => commands.countCalendarEvents(sourceCalendarIds),
      enabled: open && connected && sourceCalendarIds.length > 0,
      staleTime: 0,
    });
    const eventCounts = countsQuery.data ?? {};
    const totalEvents = sourceCalendarIds.reduce((sum, id) => sum + (eventCounts[id] ?? 0), 0);

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
          title={scheduleText("merge.title")}
          subtitle={scheduleText("merge.summary", {
            calendars: scheduleValue(sourceCalendars.length),
            events: scheduleValue(totalEvents),
          })}
          size="lg"
          impact={scheduleText("merge.description")}
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={onClose}>
                {scheduleText("action.cancel")}
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={
                  !targetCalendarId || sourceCalendars.length === 0 || !countsQuery.isSuccess
                }
                onClick={() => setConfirming(true)}
              >
                {scheduleText("merge.action")}
              </Button>
            </>
          }
        >
          <DialogBody>
            <div className="flex flex-col gap-4">
              <section className="flex flex-col gap-1">
                <span className="text-ink-2 text-[12px]">{scheduleText("merge.sources")}</span>
                {sourceCalendars.map(calendar => (
                  <div
                    key={calendar.id}
                    style={toneStyle(calendar.color)}
                    className={cn("flex h-8 items-center gap-2.5 rounded-[8px] px-2", TONE)}
                  >
                    <i className="size-2.5 rounded-[3px] bg-[var(--cal)]" />
                    <span className="text-tau-body flex-1">{calendar.title}</span>
                    <span className="text-ink-3 font-tau-mono text-[11.5px]">
                      {eventCounts[calendar.id] === undefined
                        ? "…"
                        : scheduleText("summary.events", {
                            count: scheduleValue(eventCounts[calendar.id]),
                          })}
                    </span>
                    <IconButton
                      className="size-6"
                      title={scheduleText("merge.remove")}
                      aria-label={scheduleText("merge.removeNamed", {
                        title: scheduleValue(calendar.title),
                      })}
                      onClick={() => toggleCalendarForMerge(calendar.id)}
                    >
                      <X className="size-3.5" strokeWidth={1.75} />
                    </IconButton>
                  </div>
                ))}
              </section>

              <section className="flex flex-col gap-1">
                <span className="text-ink-2 text-[12px]">{scheduleText("merge.target")}</span>
                {targetCalendars.length === 0 ? (
                  <p className="border-line-1 text-ink-3 text-tau-meta rounded-[10px] border px-3 py-4 text-center">
                    {scheduleText("merge.noTarget")}
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
          title={scheduleText("merge.confirm")}
          context={target?.title}
          description={scheduleText("merge.confirmDescription", {
            calendars: scheduleValue(sourceCalendars.length),
            events: scheduleValue(totalEvents),
            title: scheduleValue(target?.title ?? ""),
          })}
          impact={scheduleText("merge.irreversible")}
          confirmText={scheduleText("merge.action")}
          onConfirm={async () => {
            if (!targetCalendarId) return;
            try {
              const result = await mergeCalendars(sourceCalendarIds, targetCalendarId);
              toast.success(
                scheduleText("feedback.merged", {
                  calendars: scheduleValue(result.deletedCalendars),
                  events: scheduleValue(result.transferredEvents),
                })
              );
              setConfirming(false);
              onClose();
            } catch (error) {
              console.error("Failed to merge calendars:", error);
              toast.error(scheduleErrorText(error, "feedback.mergeFailed"));
            }
          }}
        />
      </>
    );
  }
);

MergeCalendarsDialog.displayName = "MergeCalendarsDialog";

export default MergeCalendarsDialog;
