import { create } from "zustand";
import { produce } from "immer";

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
  dragCard: (dragCardId: number, dropCardId: number) => void;
  dragCardToTabContainer: (dragCardId: number, side: EActiveSide, last?: boolean) => void;
  closeOtherTabs: (cardId: number, side: EActiveSide) => void;
  addCardToNotActiveSide: (cardId: number) => void;
}

const initState: IState = {
  leftCardIds: [],
  leftActiveCardId: undefined,
  rightCardIds: [],
  rightActiveCardId: undefined,
  activeSide: EActiveSide.Left,
}

const getCardSideAndIndex = (leftCardIds: number[], rightCardIds: number[], cardId: number) => {
  if (leftCardIds.includes(cardId)) {
    return {
      side: EActiveSide.Left,
      index: leftCardIds.indexOf(cardId),
    };
  } else if (rightCardIds.includes(cardId)) {
    return {
      side: EActiveSide.Right,
      index: rightCardIds.indexOf(cardId),
    };
  }

  return null;
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
    const { leftCardIds, rightCardIds, moveCardToSide } = get();
    if (leftCardIds.includes(cardId) || rightCardIds.includes(cardId)) {
      moveCardToSide(cardId, side);
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
  },
  dragCard: (dragCardId, dropCardId) => {
    const { leftCardIds, rightCardIds } = get();

    const dragInfo = getCardSideAndIndex(leftCardIds, rightCardIds, dragCardId);
    const dropInfo = getCardSideAndIndex(leftCardIds, rightCardIds, dropCardId);

    if (!dragInfo || !dropInfo) {
      return;
    }

    const { side: dragSide, index: dragIndex } = dragInfo;
    const { side: dropSide, index: dropIndex } = dropInfo;

    if (dragSide === dropSide) {
      const cards = dragSide === EActiveSide.Left ? leftCardIds : rightCardIds;
      const cardsKey = dragSide === EActiveSide.Left ? 'leftCardIds' : 'rightCardIds';
      const activeCardKey = dragSide === EActiveSide.Left ? 'leftActiveCardId' : 'rightActiveCardId';
      const newCards = produce(cards, (draft) => {
        // 先删除 drag
        draft.splice(dragIndex, 1);
        // 再插入 drop
        draft.splice(dropIndex, 0, dragCardId);
      });
      set({
        [cardsKey]: newCards,
        [activeCardKey]: dragCardId,
      });
    } else {
      const dragCards = dragSide === EActiveSide.Left ? leftCardIds : rightCardIds;
      const dragCardsKey = dragSide === EActiveSide.Left ? 'leftCardIds' : 'rightCardIds';
      const dragActiveCardKey = dragSide === EActiveSide.Left ? 'leftActiveCardId' : 'rightActiveCardId';
      const dropCards = dropSide === EActiveSide.Left ? leftCardIds : rightCardIds;
      const dropCardsKey = dropSide === EActiveSide.Left ? 'leftCardIds' : 'rightCardIds';
      const dropActiveCardKey = dropSide === EActiveSide.Left ? 'leftActiveCardId' : 'rightActiveCardId';
      const newDragCards = produce(dragCards, (draft) => {
        draft.splice(dragIndex, 1);
      });
      const newDropCards = produce(dropCards, (draft) => {
        draft.splice(dropIndex, 0, dragCardId);
      });
      const dragSideNextActiveCardId = dragCards.find(id => id !== dragCardId);
      set({
        [dragCardsKey]: newDragCards,
        [dragActiveCardKey]: dragSideNextActiveCardId,
        [dropCardsKey]: newDropCards,
        [dropActiveCardKey]: dragCardId,
        activeSide: dropSide,
      });
    }
  },
  dragCardToTabContainer: (dragCardId, side, last = true) => {
    const { leftCardIds, rightCardIds, leftActiveCardId, rightActiveCardId } = get();
    const dragInfo = getCardSideAndIndex(leftCardIds, rightCardIds, dragCardId);
    if (!dragInfo) {
      return;
    }
    const { side: dragSide, index: dragIndex } = dragInfo;
    const dragCards = dragSide === EActiveSide.Left ? leftCardIds : rightCardIds;
    const dragCardsKey = dragSide === EActiveSide.Left ? 'leftCardIds' : 'rightCardIds';
    const dragActiveCardKey = dragSide === EActiveSide.Left ? 'leftActiveCardId' : 'rightActiveCardId';
    const isDragSideActiveId = dragSide === EActiveSide.Left ? leftActiveCardId === dragCardId : rightActiveCardId === dragCardId;

    const dropCards = side === EActiveSide.Left ? leftCardIds : rightCardIds;
    const dropCardsKey = side === EActiveSide.Left ? 'leftCardIds' : 'rightCardIds';
    const dropActiveCardKey = side === EActiveSide.Left ? 'leftActiveCardId' : 'rightActiveCardId';

    if (dragSide === side) {
      // 将此卡片添加到最后
      const newDragCards = produce(dragCards, (draft) => {
        draft.splice(dragIndex, 1);
        if (last) {
          draft.push(dragCardId);
        } else {
          draft.unshift(dragCardId);
        }
      });
      set({
        [dragCardsKey]: newDragCards,
        [dragActiveCardKey]: dragCardId,
        activeSide: side,
      });
    } else {
      // 将 drag 卡片从原来的 side 中删除，添加到新的 side 中
      const newDragCards = produce(dragCards, (draft) => {
        draft.splice(dragIndex, 1);
      });

      const nextDragActiveCardId = dragCards.find(id => id !== dragCardId);
      const newDropCards = produce(dropCards, (draft) => {
        if (last) {
          draft.push(dragCardId);
        } else {
          draft.unshift(dragCardId);
        }
      });
      set({
        [dragCardsKey]: newDragCards,
        [dropCardsKey]: newDropCards,
        [dropActiveCardKey]: dragCardId,
        activeSide: side,
      });
      if (isDragSideActiveId) {
        set({
          [dragActiveCardKey]: nextDragActiveCardId,
        });
      }
    }
  },
  closeOtherTabs: (cardId, side) => {
    const { leftCardIds, rightCardIds } = get();
    const cards = side === EActiveSide.Left ? leftCardIds : rightCardIds;
    const cardsKey = side === EActiveSide.Left ? 'leftCardIds' : 'rightCardIds';
    const activeCardKey = side === EActiveSide.Left ? 'leftActiveCardId' : 'rightActiveCardId';
    const nextActiveCardId = cards.find(id => id === cardId);
    set({
      [cardsKey]: [cardId],
      [activeCardKey]: nextActiveCardId,
      activeSide: side,
    });
  },
  addCardToNotActiveSide: (cardId) => {
    const { activeSide, addCardToSide } = get();
    const notActiveSide = activeSide === EActiveSide.Left ? EActiveSide.Right : EActiveSide.Left;
    addCardToSide(cardId, notActiveSide);
  }
}));

export default useCardPanelStore;
