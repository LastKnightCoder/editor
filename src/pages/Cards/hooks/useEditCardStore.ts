import { create } from 'zustand';
import { ICard } from "@/types";
import {Descendant} from "slate";
import useCardsManagementStore from "./useCardsManagementStore.ts";

type EditingCard = Pick<ICard, 'content' | 'tags' | 'links'> & Partial<ICard>;

interface IState {
  openEditCardModal: boolean;
  addLinkModalOpen: boolean;
  cardEditable: boolean;
  editingCardId: number | undefined;
  editingCard: EditingCard | undefined;
  toBeLinkedCardList: ICard[];
  linkSearchValue: string;
}

interface IActions {
  openEditableModal: (cardId: number | undefined, cardEditable: boolean) => Promise<void>;
  openAddLinkModal: (cardId: number) => Promise<void>;
  onEditingCardChange: (content: Descendant[]) => void;
  onEditingCardCancel: () => void;
  onEditingCardSave: () => Promise<void>;
  addTag: (tag: string) => void;
  removeTag: (tag: string) => void;
  addLink: (link: number) => void;
  removeLink: (link: number) => void;
  setLinkSearchValue: (value: string) => void;
}

const initialState: IState = {
  openEditCardModal: false,
  addLinkModalOpen: false,
  cardEditable: false,
  editingCardId: undefined,
  editingCard: undefined,
  toBeLinkedCardList: [],
  linkSearchValue: '',
}

const useEditCardStore = create<IState & IActions>((set, get) => ({
  ...initialState,
  openEditableModal: async (cardId, cardEditable) => {
    if (!cardId) {
      // 创建卡片
      set({
        openEditCardModal: true,
        cardEditable,
        editingCardId: undefined,
        editingCard: {
          content: [{
            type: 'paragraph',
            children: [{ type: 'formatted', text: '' }],
          }],
          tags: [],
          links: [],
        },
      });
      return;
    }

    const cards = useCardsManagementStore.getState().cards;
    const card = cards.find(c => c.id === cardId);
    if (!card) {
      return;
    }
    set({
      openEditCardModal: true,
      cardEditable,
      editingCardId: cardId,
      editingCard: card,
    });
  },
  openAddLinkModal: async (cardId) => {
    const { cards } = useCardsManagementStore.getState();
    const editingCard = cards.find(c => c.id === cardId);
    set({
      addLinkModalOpen: true,
      editingCardId: cardId,
      editingCard,
      toBeLinkedCardList: cards.filter(c => c.tags.length > 0 && c.id !== cardId && !editingCard?.links.includes(c.id)),
    });
  },
  onEditingCardChange: (content: Descendant[]) => {
    const { editingCard} = get();
    if (!editingCard) {
      return;
    }
    set({
      editingCard: {
        ...editingCard,
        content,
      },
    });
  },
  onEditingCardCancel: () => {
    set({
      ...initialState,
    });
  },
  onEditingCardSave: async () => {
    const { editingCard } = get();
    const { cards } = useCardsManagementStore.getState();

    let id: number;
    if (editingCard) {
      if (!editingCard.id) {
        id = await useCardsManagementStore.getState().createCard(editingCard);
      } else {
        id = editingCard.id;
        await useCardsManagementStore.getState().updateCard({
          ...editingCard,
          id: editingCard.id,
        });
      }

      const originalCard = cards.find(c => c.id === editingCard?.id);
      const originalLinks = originalCard?.links || [];

      const addedLinks = editingCard.links.filter(l => !originalLinks.includes(l));
      addedLinks.forEach((link) => {
        const linkCard = cards.find(c => c.id === link);
        if (!linkCard) {
          return;
        }
        if (!linkCard.links.includes(id)) {
          useCardsManagementStore.getState().updateCard({
            ...linkCard,
            links: [...linkCard.links, id],
          });
        }
      });

      const removedLinks = originalLinks.filter(l => !editingCard.links.includes(l));
      removedLinks.forEach((link) => {
        const linkCard = cards.find(c => c.id === link);
        if (!linkCard) {
          return;
        }
        if (linkCard.links.includes(id)) {
          useCardsManagementStore.getState().updateCard({
            ...linkCard,
            links: linkCard.links.filter(l => l !== id),
          });
        }
      });
    }
    set({
      ...initialState,
    });
  },
  addTag: (tag) => {
    const { editingCard } = get();
    // 判断是否已经存在
    if (!editingCard || editingCard.tags.includes(tag) || !tag) {
      return;
    }
    set({
      editingCard: {
        ...editingCard,
        tags: [...editingCard.tags, tag],
      }
    })
  },
  removeTag: (tag) => {
    const { editingCard } = get();
    if (!editingCard) {
      return;
    }
    set({
      editingCard: {
        ...editingCard,
        tags: editingCard.tags.filter(t => t !== tag),
      }
    });
  },
  addLink: (link) => {
    const { editingCard, toBeLinkedCardList } = get();
    // 判断是否已经存在
    if (!editingCard || editingCard.links.includes(link)) {
      return;
    }
    const newToBeLinkedList = toBeLinkedCardList.filter(c => c.id !== link);
    set({
      editingCard: {
        ...editingCard,
        links: [...editingCard.links, link],
      },
      toBeLinkedCardList: newToBeLinkedList,
    })
  },
  removeLink: (link) => {
    const { editingCard } = get();
    const { cards } = useCardsManagementStore.getState();
    if (!editingCard) {
      return;
    }
    const newToBeLinkedList = [...get().toBeLinkedCardList, cards.find(c => c.id === link)].filter(c => c);
    set({
      editingCard: {
        ...editingCard,
        links: editingCard.links.filter(t => t !== link),
      },
      toBeLinkedCardList: newToBeLinkedList as ICard[],
    });
  },
  setLinkSearchValue: (value) => {
    // 根据 value 筛选出来的卡片
    const { cards } = useCardsManagementStore.getState();
    const toBeLinkedCardList = cards.filter(
      c =>
        c.tags.some(tag => tag.includes(value)) &&
        c.id !== get().editingCardId &&
        !get().editingCard?.links.includes(c.id)
    );
    console.log(toBeLinkedCardList, value);
    set({
      linkSearchValue: value,
      toBeLinkedCardList,
    });
  }
}));

export default useEditCardStore;
