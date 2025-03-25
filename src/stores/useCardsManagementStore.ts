import { create } from "zustand";
import { getAllCards, createCard, updateCard, deleteCard } from "@/commands";
import { ECardCategory, ICard, ICreateCard, IUpdateCard } from "@/types";
import { produce } from "immer";

interface IState {
  cards: ICard[];
  selectCategory: ECardCategory;
  activeCardTag: string;
}

interface IActions {
  init: () => Promise<void>;
  createCard: (card: ICreateCard) => Promise<ICard>;
  updateCard: (card: IUpdateCard) => Promise<ICard>;
  deleteCard: (id: number) => Promise<number>;
}

const initState: IState = {
  cards: [],
  selectCategory: ECardCategory.Permanent,
  activeCardTag: "",
};

const useCardsManagementStore = create<IState & IActions>((set, get) => ({
  ...initState,
  init: async () => {
    set({
      ...initState,
    });
    const cards = await getAllCards();
    set({ cards });
  },
  createCard: async (card) => {
    const { cards } = get();
    const res = await createCard(card);
    const newCards = produce(cards, (draft) => {
      if (!draft.find((c) => c.id === res.id)) {
        draft.unshift(res);
      }
    });
    set({ cards: newCards });
    return res;
  },
  updateCard: async (card) => {
    const { cards } = get();
    const res = await updateCard(card);
    const newCards = produce(cards, (draft) => {
      const index = draft.findIndex((c) => c.id === res.id);
      if (index !== -1) {
        draft[index] = res;
      }
    });
    set({ cards: newCards });
    return res;
  },
  deleteCard: async (id) => {
    const { cards } = get();
    const res = await deleteCard(id);
    // 这个应该是服务端处理的，不过 Rust 不熟，现在这里处理一下
    const deletedCard = cards.find((c) => c.id === id);
    if (deletedCard) {
      const links = deletedCard.links;
      const linkedCards = cards.filter((c) => links.includes(c.id));
      const updatePromises = linkedCards.map((linkCard) =>
        updateCard({
          ...linkCard,
          links: linkCard.links.filter((l) => l !== id),
        }),
      );
      await Promise.all(updatePromises);
    }
    const newCards = await getAllCards();
    set({ cards: newCards });
    return res;
  },
}));

export default useCardsManagementStore;
