import { DailyNote } from "@/types/daily_note.ts";
import { invoke } from "@tauri-apps/api";

export const createDailyNote = async (dailyNote: Omit<DailyNote, 'id'>): Promise<DailyNote> => {
  const createdDailyNote: any = await invoke('plugin:daily_note|insert_daily_note', {
    content: JSON.stringify(dailyNote.content),
    date: dailyNote.date,
  });

  return {
    ...createdDailyNote,
    content: JSON.parse(createdDailyNote.content),
  }
}

export const updateDailyNote = async (dailyNote: Omit<DailyNote, 'date'>): Promise<DailyNote> => {
  const { id, content } = dailyNote;
  const res: any = await invoke('plugin:daily_note|update_daily_note', {
    id,
    content: JSON.stringify(content),
  });
  return {
    ...res,
    content: JSON.parse(res.content),
  }
}

export const getDailyNoteById = async (id: number): Promise<DailyNote> => {
  const res: any = await invoke('plugin:daily_note|find_daily_note_by_id', {
    id
  });

  return {
    ...res,
    content: JSON.parse(res.content),
  }
}

export const getDailyNoteByDate = async (date: string): Promise<DailyNote> => {
  const res: any =  await invoke('plugin:daily_note|find_daily_note_by_date', {
    date
  });

  return {
    ...res,
    content: JSON.parse(res.content),
  }
}

export const getAllDailyNotes = async (): Promise<DailyNote[]> => {
  const list: any[] = await invoke('plugin:daily_note|find_all_daily_notes');
  return list.map((item) => {
    return {
      ...item,
      content: JSON.parse(item.content),
    }
  });
}

export const deleteDailyNote = async (id: number): Promise<number> => {
  return await invoke('plugin:daily_note|delete_daily_note', {
    id
  })
}
