import { command } from "@tau/rpc";
import type { DailyNote } from "@/types/daily_note.ts";

/** 每日笔记域命令契约（tables 模式，契约当前约束渲染侧） */
export const dailyNoteCommands = {
  create: command<[Omit<DailyNote, "id" | "contentId">], DailyNote>("create-daily-note"),
  update: command<[Omit<DailyNote, "date">], DailyNote>("update-daily-note"),
  getById: command<[number], DailyNote>("get-daily-note-by-id"),
  getByDate: command<[string], DailyNote>("get-daily-note-by-date"),
  getAll: command<[], DailyNote[]>("get-all-daily-notes"),
  remove: command<[number], number>("delete-daily-note"),
};
