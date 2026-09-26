/**
 * 日程详情抽屉状态：各视图只调 peek(event)，抽屉本体（EventDrawer）由 ScheduleView 挂一份。
 */

import { create } from "zustand";
import type { CalendarEvent } from "@/types";

interface PeekState {
  event: CalendarEvent | null;
  peek: (event: CalendarEvent) => void;
  close: () => void;
}

export const usePeekStore = create<PeekState>(set => ({
  event: null,
  peek: event => set({ event }),
  close: () => set({ event: null }),
}));
