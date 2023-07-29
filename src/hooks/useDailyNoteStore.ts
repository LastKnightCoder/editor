import { create } from "zustand";
import { DailyNote } from "@/types/daily_note.ts";
import { getAllDailyNotes, createDailyNote, updateDailyNote, deleteDailyNote } from '@/commands';
import {Descendant} from "slate";

interface IState {
  dailyNotes: DailyNote[];
  initLoading: boolean;
  editingDailyNote?: Partial<DailyNote>;
  editingDailyNoteOpen: boolean;
}

interface IActions {
  init: () => Promise<void>;
  onCreateDailyNote: (date: string) => void;
  onUpdateDailyNote: (dailyNote: DailyNote) => Promise<void>;
  onDailyContentChange: (content: Descendant[]) => void;
  onSaveDailyNote: () => Promise<void>;
  onCancelDailyNote: () => void;
  deleteDailyNote: (id: number) => Promise<void>;
}

const initialState: IState = {
  dailyNotes: [],
  initLoading: false,
  editingDailyNoteOpen: false,
}

const useDailyNoteStore = create<IState & IActions>((set, get) => ({
  ...initialState,
  init: async () => {
    set({ initLoading: true });
    const dailyNotes = await getAllDailyNotes();
    set({ dailyNotes, initLoading: false });
  },
  onCreateDailyNote: (date: string) => {
    set({
      editingDailyNoteOpen: true,
      editingDailyNote: {
        content: [{
          type: 'paragraph',
          children: [{ type: 'formatted',text: '' }],
        }],
        date,
      }
    });
  },
  onUpdateDailyNote: async (dailyNote: DailyNote) => {
    set({
      editingDailyNoteOpen: true,
      editingDailyNote: dailyNote,
    });
  },
  onSaveDailyNote: async () => {
    const { editingDailyNote } = get();
    if (!editingDailyNote) return;
    const { id } = editingDailyNote;
    if (id) {
      await updateDailyNote({
        id,
        content: editingDailyNote.content!,
      });
    } else {
      await createDailyNote({
        content: editingDailyNote.content!,
        date: editingDailyNote.date!,
      });
    }
    const dailyNotes = await getAllDailyNotes();
    set({
      editingDailyNote: undefined,
      editingDailyNoteOpen: false,
      dailyNotes,
    });
  },
  onCancelDailyNote: () => {
    set({
      editingDailyNote: undefined,
      editingDailyNoteOpen: false,
    })
  },
  onDailyContentChange: (content: Descendant[]) => {
    const { editingDailyNote } = get();
    set({
      editingDailyNote: {
        ...editingDailyNote,
        content,
      }
    });
  },
  deleteDailyNote: async (id: number) => {
    await deleteDailyNote(id);
    const dailyNotes = await getAllDailyNotes();
    set({
      dailyNotes,
    });
  }
}))

export default useDailyNoteStore;
