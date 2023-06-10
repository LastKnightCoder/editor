import { create } from "zustand";
import {
  insertCard,
  getAllCards,
  deleteCard, updateCard,
} from '@/commands';
import { ICard } from "@/types";

interface IState {
  cards: ICard[];
  initLoading: boolean;
}

interface IActions {
  init: () => Promise<void>;
  addNewCard: (card: Pick<ICard, 'content' | 'tags'>) => Promise<number>;
  deleteCard: (id: number) => Promise<number>;
  updateCard: (card: Pick<ICard, 'content' | 'tags'>) => Promise<number>;
}

const useCardsManagementStore = create<IState & IActions>((set) => ({
  cards: [],
  initLoading: false,
  init: async () => {
    set({ initLoading: true });
    const cards = await getAllCards();
    set({ cards, initLoading: false });
  },
  addNewCard: async (card) => {
    const res =  await insertCard(card);
    const cards = await getAllCards();
    set({ cards });
    return res;
  },
  deleteCard: async (id) => {
    const res = await deleteCard(id);
    const cards = await getAllCards();
    set({ cards });
    return res;
  },
  updateCard: async (card) => {
    const res = await updateCard(card);
    const cards = await getAllCards();
    set({ cards });
    return res;
  }
}));

export default useCardsManagementStore;
