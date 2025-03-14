import { DailyNote } from "@/types/daily_note.ts";
import { invoke } from "@/electron";

export const createDailyNote = async (
  dailyNote: Omit<DailyNote, "id">,
): Promise<DailyNote> => {
  return await invoke("create-daily-note", dailyNote);
};

export const updateDailyNote = async (
  dailyNote: Omit<DailyNote, "date">,
): Promise<DailyNote> => {
  return await invoke("update-daily-note", dailyNote);
};

export const getDailyNoteById = async (id: number): Promise<DailyNote> => {
  return await invoke("get-daily-note-by-id", id);
};

export const getDailyNoteByDate = async (date: string): Promise<DailyNote> => {
  return await invoke("get-daily-note-by-date", date);
};

export const getAllDailyNotes = async (): Promise<DailyNote[]> => {
  return await invoke("get-all-daily-notes");
};

export const deleteDailyNote = async (id: number): Promise<number> => {
  return await invoke("delete-daily-note", id);
};
