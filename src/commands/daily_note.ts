import { DailyNote } from "@/types/daily_note.ts";
import { invoke } from "@tauri-apps/api";

export const createDailyNote = async (dailyNote: Omit<DailyNote, 'id'>): Promise<number> => {
  return await invoke('insert_daily_note', {
    content: JSON.stringify(dailyNote.content),
    date: dailyNote.date,
  })
}

export const updateDailyNote = async (dailyNote: Omit<DailyNote, 'date'>): Promise<number> => {
  const { id, content } = dailyNote;
  return await invoke('update_daily_note', {
    id,
    content: JSON.stringify(content),
  })
}

export const getDailyNoteById = async (id: number): Promise<DailyNote> => {
  return await invoke('find_daily_note_by_id', {
    id
  })
}

export const getDailyNoteByDate = async (date: string): Promise<DailyNote> => {
  return await invoke('find_daily_note_by_date', {
    date
  })
}

export const getAllDailyNotes = async (): Promise<DailyNote[]> => {
  const list: any[] = await invoke('find_all_daily_notes');
  return list.map((item) => {
    return {
      ...item,
      content: JSON.parse(item.content),
    }
  });
}
