import { useState } from 'react';
import { useMemoizedFn } from 'ahooks';

const useCardManagement = () => {
  const [cardIds, setCardIds] = useState<number[]>([]);
  const [activeCardId, setActiveCardId] = useState<number>();

  const addCard = useMemoizedFn((cardId: number) => {
    // 如果已经存在，就不添加了
    if (cardIds.includes(cardId)) return;
    setCardIds([...cardIds, cardId]);
  });

  const removeCard = useMemoizedFn((cardId: number) => {
    setCardIds(cardIds.filter(id => id !== cardId));
  });

  const setActive = useMemoizedFn((cardId: number | undefined) => {
    setActiveCardId(cardId);
  });

  return {
    cardIds,
    activeCardId,
    addCard,
    removeCard,
    setActive,
  }
}

export default useCardManagement;