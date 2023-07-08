import { create } from "zustand";
import {
  getAllCards,
  createCard,
  updateCard,
  deleteCard,
} from '@/commands';
import { ICard } from "@/types";

interface IState {
  cards: ICard[];
  initLoading: boolean;
}

interface IActions {
  init: () => Promise<void>;
  createCard: (card: Pick<ICard, 'content' | 'tags'>) => Promise<number>;
  updateCard: (card: Pick<ICard, 'content' | 'tags' | 'id'>) => Promise<number>;
  deleteCard: (id: number) => Promise<number>;
}

const useCardsManagementStore = create<IState & IActions>((set) => ({
  cards: [],
  initLoading: false,
  init: async () => {
    set({ initLoading: true });
    const cards = await getAllCards();
    set({ cards, initLoading: false });
  },
  createCard: async (card) => {
    const res = await createCard(card);
    const cards = await getAllCards();
    set({ cards });
    return res;
  },
  updateCard: async (card) => {
    const res = await updateCard(card);
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
}));

export default useCardsManagementStore;
