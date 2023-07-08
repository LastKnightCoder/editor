import { create } from 'zustand';
import { ICard } from "@/types";
import {Descendant} from "slate";
import useCardsManagementStore from "@/pages/Index/Cards/hooks/useCardsManagementStore.ts";

type EditingCard = Pick<ICard, 'content' | 'tags'> & Partial<ICard>;

interface IState {
  openEditCardModal: boolean;
  cardEditable: boolean;
  editingCardId: number | undefined;
  editingCard: EditingCard | undefined;
}

interface IActions {
  openEditableModal: (cardId: number | undefined, cardEditable: boolean) => Promise<void>;
  onEditingCardChange: (content: Descendant[]) => void;
  onEditingCardCancel: () => void;
  onEditingCardSave: () => Promise<void>;
  addTag: (tag: string) => void;
  removeTag: (tag: string) => void;
}

const initialState: IState = {
  openEditCardModal: false,
  cardEditable: false,
  editingCardId: undefined,
  editingCard: undefined,
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
    if (editingCard) {
      if (!editingCard.id) {
        await useCardsManagementStore.getState().createCard(editingCard);
      } else {
        await useCardsManagementStore.getState().updateCard({
          ...editingCard,
          id: editingCard.id,
        });
      }
    }
    set({
      ...initialState,
    });
  },
  addTag: (tag) => {
    const { editingCard } = get();
    // 判断是否已经存在
    if (!editingCard || editingCard.tags.includes(tag)) {
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
  }
}));

export default useEditCardStore;
