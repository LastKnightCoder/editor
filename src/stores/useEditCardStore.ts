import { create } from 'zustand';
import { ICard } from "@/types";
import { CREATE_CARD_ID, DEFAULT_CARD_CONTENT } from "@/constants";
import { findOneCard } from "@/commands";
import { Descendant } from "slate";
import useCardsManagementStore from "./useCardsManagementStore.ts";
import {produce} from "immer";

export type EditingCard = Pick<ICard, 'content' | 'tags' | 'links'> & Partial<ICard>;

interface IState {
  initLoading: boolean;
  addLinkModalOpen: boolean;
  editingCardId: number | undefined;
  editingCard: EditingCard | undefined;
  readonly: boolean;
}

interface IActions {
  initCard: (cardId: number) => Promise<EditingCard>;
  onEditingCardChange: (content: Descendant[]) => void;
  onEditingCardCancel: () => void;
  onEditingCardSave: () => Promise<void>;
  openAddLinkModal: () => void;
  closeAddLinkModal: () => void;
  addTag: (tag: string) => void;
  removeTag: (tag: string) => void;
  addLink: (link: number) => void;
  removeLink: (link: number) => void;
  toggleReadonly: () => void;
}

const initialState: IState = {
  initLoading: true,
  addLinkModalOpen: false,
  editingCardId: undefined,
  editingCard: undefined,
  readonly: true,
}

const useEditCardStore = create<IState & IActions>((set, get) => ({
  ...initialState,
  initCard: async (cardId) => {
    set({
      initLoading: true,
    });
    if (cardId === CREATE_CARD_ID) {
      const defaultCard: EditingCard = {
        id: cardId,
        content: DEFAULT_CARD_CONTENT,
        tags: [],
        links: [],
      };
      set({
        editingCard: defaultCard,
        initLoading: false,
      });
      return defaultCard;
    }

    const card = await findOneCard(cardId);
    if (!card) {
      throw new Error('Card not found');
    }
    set({
      editingCard: card,
      initLoading: false,
    });
    return card;
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
    if (editingCard && editingCard?.id) {
      if (editingCard.id === CREATE_CARD_ID) {
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

      set({
        editingCardId: id,
        editingCard: produce(editingCard, draft => {
          draft.id = id;
        })
      });
    }
  },
  addTag: (tag) => {
    const { editingCard } = get();
    // 判断是否已经存在
    if (!editingCard || editingCard.tags.includes(tag) || !tag) {
      return;
    }
    set({
      editingCard: produce(editingCard, draft => {
        draft.tags.push(tag);
      })
    })
  },
  removeTag: (tag) => {
    const { editingCard } = get();
    if (!editingCard) {
      return;
    }
    set({
      editingCard: produce(editingCard, draft => {
        draft.tags = draft.tags.filter(t => t !== tag);
      })
    })
  },
  addLink: (link) => {
    const { editingCard } = get();
    if (!editingCard || editingCard.links.includes(link)) {
      return;
    }
    set({
      editingCard: produce(editingCard, draft => {
        draft.links.push(link);
      })
    })
  },
  removeLink: (link) => {
    const { editingCard } = get();
    if (!editingCard) {
      return;
    }
    set({
      editingCard: produce(editingCard, draft => {
        draft.links = draft.links.filter(t => t !== link);
      })
    })
  },
  openAddLinkModal: () => {
    set({
      addLinkModalOpen: true,
    });
  },
  closeAddLinkModal: () => {
    set({
      addLinkModalOpen: false,
    });
  },
  toggleReadonly: () => {
    const { readonly } = get();
    set({
      readonly: !readonly,
    });
  }
}));

export default useEditCardStore;
