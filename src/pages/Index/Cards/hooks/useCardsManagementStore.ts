import { create } from "zustand";
import {
  insertCard,
  getAllCards,
  deleteCard,
  updateCard,
} from '@/commands';
import { ICard } from "@/types";
import { Descendant } from "slate";
import React from "react";
import { EditorRef } from "@/pages/Editor";

interface IEditingCard {
  id?: number;
  tags: string;
  content: Descendant[];
}

interface IState {
  cards: ICard[];
  editingCard: IEditingCard,
  initLoading: boolean;
  editorRef: React.RefObject<EditorRef>;
}

interface IActions {
  init: (editorRef: React.RefObject<EditorRef>) => Promise<void>;
  deleteCard: (id: number) => Promise<number>;
  createOrUpdateCard: () => Promise<number>;
  updateEditingCard: (card: Partial<IEditingCard>) => void;
}

const initEditingCard: IEditingCard = {
  tags: '',
  content: [{
    type: 'paragraph',
    children: [{ type: 'formatted', text: '' }],
  }],
}

const useCardsManagementStore = create<IState & IActions>((set, get) => ({
  cards: [],
  editingCard: initEditingCard,
  initLoading: false,
  editorRef: React.createRef<EditorRef>(),
  init: async (editorRef) => {
    set({ initLoading: true });
    const cards = await getAllCards();
    console.log('cards', cards);
    const editingCard: IEditingCard = JSON.parse(localStorage.getItem('editingCard') || JSON.stringify(initEditingCard));
    set({ cards, initLoading: false, editingCard, editorRef });
    if (editorRef.current) {
      editorRef.current.setEditorValue(editingCard.content);
    }
  },
  deleteCard: async (id) => {
    const res = await deleteCard(id);
    const cards = await getAllCards();
    set({ cards });
    return res;
  },
  createOrUpdateCard: async () => {
    const { editingCard, editorRef } = get();
    let res: number;
    if (editingCard.id) {
      res = await updateCard({
        id: editingCard.id,
        tags: editingCard.tags,
        content: JSON.stringify(editingCard.content),
      });
    } else {
      res = await insertCard({
        tags: editingCard.tags,
        content: JSON.stringify(editingCard.content),
      });
    }
    const cards = await getAllCards();
    set({
      cards,
      editingCard: initEditingCard
    });
    if (editorRef.current) {
      editorRef.current.setEditorValue(initEditingCard.content);
    }
    return res;
  },
  updateEditingCard: (card) => {
    const { editingCard } = get();
    const newEditingCard = {
      ...editingCard,
      ...card,
    }
    set({
      editingCard: newEditingCard
    });
    localStorage.setItem('editingCard', JSON.stringify(newEditingCard));
  }
}));

export default useCardsManagementStore;
