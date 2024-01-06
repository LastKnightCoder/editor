import { create } from "zustand";
import {
  getAllCards,
  createCard,
  updateCard,
  deleteCard,
} from '@/commands';
import { ECardCategory, ICard } from "@/types";

interface IState {
  cards: ICard[];
  initLoading: boolean;
  selectCategory: ECardCategory;
}

interface IActions {
  init: () => Promise<void>;
  createCard: (card: Pick<ICard, 'content' | 'tags' | 'links' | 'category'>) => Promise<number>;
  updateCard: (card: Pick<ICard, 'content' | 'tags' | 'id' | 'links' | 'category'>) => Promise<number>;
  deleteCard: (id: number) => Promise<number>;
}

const initState: IState = {
  cards: [],
  initLoading: false,
  selectCategory: ECardCategory.Permanent,
}

const useCardsManagementStore = create<IState & IActions>((set, get) => ({
  ...initState,
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
    const { cards } = get();
    const res = await deleteCard(id);
    // 这个应该是服务端处理的，不过 Rust 不熟，现在这里处理一下
    const deletedCard = cards.find(c => c.id === id);
    if (deletedCard) {
      const links = deletedCard.links;
      const linkedCards = cards.filter(c => links.includes(c.id));
      linkedCards.forEach(linkCard => {
        updateCard({
          ...linkCard,
          links: linkCard.links.filter(l => l !== id),
        })
      });
    }
    const newCards = await getAllCards();
    set({ cards: newCards });
    return res;
  },
}));

export default useCardsManagementStore;
