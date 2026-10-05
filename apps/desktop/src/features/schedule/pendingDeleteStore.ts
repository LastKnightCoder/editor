/**
 * 日程的延迟删除：删除不二次确认——立即从各视图隐藏，Toast 给 UNDO_MS 撤销，到时才落库；
 * 离开日程页（ScheduleView 卸载）立即落库。不采用「先删再重建」：主进程删除会连带删掉备注内容。
 * 视图过滤在 useCalendarEvents 里统一做。
 */

import { create } from "zustand";
import { toast } from "@tau/ui";
import type { CalendarEvent } from "@/types";

export const UNDO_MS = 5000;

interface PendingDeleteState {
  ids: ReadonlySet<number>;
}

export const usePendingDeletes = create<PendingDeleteState>(() => ({ ids: new Set() }));

const pending = new Map<number, { timer: number; commit: () => Promise<unknown> }>();

const drop = (id: number) =>
  usePendingDeletes.setState(state => {
    const ids = new Set(state.ids);
    ids.delete(id);
    return { ids };
  });

function flush(id: number) {
  const entry = pending.get(id);
  if (!entry) return;
  window.clearTimeout(entry.timer);
  pending.delete(id);
  entry
    .commit()
    .catch(() => toast.error("删除日程失败"))
    .finally(() => drop(id));
}

function undo(id: number) {
  const entry = pending.get(id);
  if (!entry) return;
  window.clearTimeout(entry.timer);
  pending.delete(id);
  drop(id);
}

/** commit 在到时或离开页面时执行（调用方绑定好当前库的删除命令） */
export function scheduleEventDelete(event: CalendarEvent, commit: () => Promise<unknown>) {
  if (pending.has(event.id)) return;
  usePendingDeletes.setState(state => ({ ids: new Set(state.ids).add(event.id) }));
  pending.set(event.id, { timer: window.setTimeout(() => flush(event.id), UNDO_MS), commit });
  toast.info(`已删除「${event.title || "日程"}」`, {
    duration: UNDO_MS,
    action: { label: "撤销", onClick: () => undo(event.id) },
  });
}

export function flushEventDeletes() {
  for (const id of [...pending.keys()]) flush(id);
}
