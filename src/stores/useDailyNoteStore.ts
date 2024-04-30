import { create } from "zustand";
import { DailyNote } from "@/types/daily_note.ts";
import { getAllDailyNotes, createDailyNote, updateDailyNote, deleteDailyNote } from '@/commands';
import { produce } from "immer";

interface IState {
  initLoading: boolean;
  dailyNotes: DailyNote[];
  activeDailyId?: number;
}

interface IActions {
  init: () => Promise<void>;
  onCreateDailyNote: (date: string) => Promise<DailyNote>;
  onUpdateDailyNote: (dailyNote: DailyNote) => Promise<DailyNote>;
  deleteDailyNote: (id: number) => Promise<number>;
}

const initialState: IState = {
  dailyNotes: [],
  initLoading: false,
  activeDailyId: undefined,
}

const useDailyNoteStore = create<IState & IActions>((set, get) => ({
  ...initialState,
  init: async () => {
    set({
      ...initialState,
      initLoading: true
    });
    const dailyNotes = await getAllDailyNotes();
    set({ dailyNotes, initLoading: false });
  },
  onCreateDailyNote: async (date: string) => {
    const { dailyNotes } = get();
    const res = await createDailyNote({
      date,
      content: [{
        type: 'paragraph',
        children: [{ type: 'formatted', text: '' }],
      }]
    });
    const newDailyNotes = produce(dailyNotes, (draft) => {
      draft.push(res);
    });
    set({
      dailyNotes: newDailyNotes,
    });

    return res;
  },
  onUpdateDailyNote: async (dailyNote: DailyNote) => {
    const { dailyNotes } = get();
    const res = await updateDailyNote(dailyNote);
    const newDailyNotes = produce(dailyNotes, (draft) => {
      const index = draft.findIndex((item) => item.id === dailyNote.id);
      if (index !== -1) {
        draft[index] = res;
      }
    });
    set({
      dailyNotes: newDailyNotes,
    });
    return res;
  },
  deleteDailyNote: async (id: number) => {
    const { dailyNotes } = get();
    const res = await deleteDailyNote(id);
    const newDailyNotes = produce(dailyNotes, (draft) => {
      const index = draft.findIndex((item) => item.id === id);
      if (index !== -1) {
        draft.splice(index, 1);
      }
    });
    set({
      dailyNotes: newDailyNotes,
    });
    return res;
  }
}))

export default useDailyNoteStore;
