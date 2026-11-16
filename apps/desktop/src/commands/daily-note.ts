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
