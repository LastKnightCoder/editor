import { create } from "zustand";

export enum EActiveSide {
  Left = 'left',
  Right = 'right',
}

interface IState {
  leftCardIds: number[];
  leftActiveCardId: number | undefined;
  rightCardIds: number[];
  rightActiveCardId: number | undefined;
  activeSide: EActiveSide;
}

interface IActions {
  addCard: (cardId: number) => void;
  removeCard: (cardId: number) => void;
  moveCard: (cardId: number) => void;
  moveCardToSide: (cardId: number, side: EActiveSide) => void;
  addCardToSide: (cardId: number, side: EActiveSide) => void;
}

const initState: IState = {
  leftCardIds: [],
  leftActiveCardId: undefined,
  rightCardIds: [],
  rightActiveCardId: undefined,
  activeSide: EActiveSide.Left,
}

const useCardPanelStore = create<IState & IActions>((set, get) => ({
  ...initState,
  addCard: (cardId) => {
    const { activeSide, addCardToSide } = get();
    addCardToSide(cardId, activeSide);
  },
  removeCard: (cardId) => {
    const { leftCardIds, rightCardIds, leftActiveCardId, rightActiveCardId } = get();
    if (!leftCardIds.includes(cardId) && !rightCardIds.includes(cardId)) {
      return;
    }
    if (leftCardIds.includes(cardId)) {
      const nextActiveCardId = leftCardIds.find(id => id !== cardId);
      set({
        leftCardIds: leftCardIds.filter(id => id !== cardId),
        leftActiveCardId: leftActiveCardId === cardId ? nextActiveCardId : leftActiveCardId,
      });
    } else if (rightCardIds.includes(cardId)) {
      const nextActiveCardId = rightCardIds.find(id => id !== cardId);
      set({
        rightCardIds: rightCardIds.filter(id => id !== cardId),
        rightActiveCardId: rightActiveCardId === cardId ? nextActiveCardId : rightActiveCardId,
      });
    }
  },
  moveCard: (cardId) => {
    const { leftCardIds, rightCardIds, moveCardToSide } = get();
    if (!leftCardIds.includes(cardId) && !rightCardIds.includes(cardId)) {
      return;
    }
    if (leftCardIds.includes(cardId)) {
      // 从左边移出，加入右边
      moveCardToSide(cardId, EActiveSide.Right);
    } else {
      // 从右边移出，加入左边
      moveCardToSide(cardId, EActiveSide.Left);
    }
  },
  moveCardToSide: (cardId, side) => {
    const { leftCardIds, rightCardIds, leftActiveCardId, rightActiveCardId } = get();
    if (!leftCardIds.includes(cardId) && !rightCardIds.includes(cardId)) {
      return;
    }

    // 如果在对面，则移过来，否则什么都不做
    const currentCards = side === EActiveSide.Left ? leftCardIds : rightCardIds;
    const oppositeCards = side === EActiveSide.Left ? rightCardIds : leftCardIds;
    const oppositeActiveCardId = side === EActiveSide.Left ? rightActiveCardId : leftActiveCardId;
    const oppositeNextActiveCardId = oppositeCards.find(id => id !== cardId);

    const currentCardsKey = side === EActiveSide.Left ? 'leftCardIds' : 'rightCardIds';
    const currentActiveCardIdKey = side === EActiveSide.Left ? 'leftActiveCardId' : 'rightActiveCardId';
    const oppositeActiveCardsKey = side === EActiveSide.Left ? 'rightCardIds' : 'leftCardIds';
    const oppositeActiveCardIdKey = side === EActiveSide.Left ? 'rightActiveCardId' : 'leftActiveCardId';

    if (oppositeCards.includes(cardId)) {
      set({
        [currentCardsKey]: [...currentCards, cardId],
        [currentActiveCardIdKey]: cardId,
        [oppositeActiveCardsKey]: oppositeCards.filter(id => id !== cardId),
        [oppositeActiveCardIdKey]: oppositeActiveCardId === cardId ? oppositeNextActiveCardId : oppositeActiveCardId,
        activeSide: side,
      });
    }
  },
  addCardToSide: (cardId, side) => {
    const { leftCardIds, rightCardIds } = get();
    if (leftCardIds.includes(cardId) || rightCardIds.includes(cardId)) {
      return;
    }
    const cards = side === EActiveSide.Left ? leftCardIds : rightCardIds;
    const cardsKey = side === EActiveSide.Left ? 'leftCardIds' : 'rightCardIds';
    const activeCardKey = side === EActiveSide.Left ? 'leftActiveCardId' : 'rightActiveCardId';
    set({
      [cardsKey]: [...cards, cardId],
      [activeCardKey]: cardId,
      activeSide: side,
    });
  }
}));

export default useCardPanelStore;
