import { bindDatabaseCommands, currentCommandScope } from "@/services/command-context";
import { DailyNote } from "@/types/daily_note.ts";
import { dailyNoteCommands } from "@/commands/contracts/daily-note";

export const createDailyNote = async (
  dailyNote: Omit<DailyNote, "id" | "contentId">
): Promise<DailyNote> => {
  const command = bindDatabaseCommands(dailyNoteCommands.create, currentCommandScope());
  return command.call({
    ...dailyNote,
    ...(await (
      await import("@/services/editorKit")
    ).prepareNewContent(dailyNote.content, dailyNote.contracts)),
  });
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
