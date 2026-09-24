/**
 * 日程速览浮层状态（方案 C：点日程先出锚定 Popover，「编辑」再进 EventDialog）。
 * 各视图只调 peek(event, 被点元素)，浮层本体由 ScheduleView 挂一份。
 */

import { create } from "zustand";
import type { CalendarEvent } from "@/types";

interface PeekState {
  event: CalendarEvent | null;
  anchor: HTMLElement | null;
  peek: (event: CalendarEvent, anchor: HTMLElement) => void;
  close: () => void;
}

export const usePeekStore = create<PeekState>(set => ({
  event: null,
  anchor: null,
  peek: (event, anchor) => set({ event, anchor }),
  close: () => set({ event: null, anchor: null }),
}));
