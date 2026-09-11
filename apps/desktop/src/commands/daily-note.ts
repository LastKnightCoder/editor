import { DailyNote } from "@/types/daily_note.ts";
import { dailyNoteCommands } from "@/commands/contracts/daily-note";

export const createDailyNote = async (
  dailyNote: Omit<DailyNote, "id" | "contentId">
): Promise<DailyNote> => {
  return dailyNoteCommands.create.call(dailyNote);
};

export const updateDailyNote = async (dailyNote: Omit<DailyNote, "date">): Promise<DailyNote> => {
  return dailyNoteCommands.update.call(dailyNote);
};

export const getDailyNoteById = async (id: number): Promise<DailyNote> => {
  return dailyNoteCommands.getById.call(id);
};

export const getDailyNoteByDate = async (date: string): Promise<DailyNote> => {
  return dailyNoteCommands.getByDate.call(date);
};

export const getAllDailyNotes = async (): Promise<DailyNote[]> => {
  return dailyNoteCommands.getAll.call();
};

export const deleteDailyNote = async (id: number): Promise<number> => {
  return dailyNoteCommands.remove.call(id);
};
