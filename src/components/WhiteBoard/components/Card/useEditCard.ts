import { useEffect, useRef, useState } from "react";
import { ICard } from "@/types";
import { useAsyncEffect, useMemoizedFn } from "ahooks";
import { Descendant } from "slate";
import { produce } from "immer";
import useCardsManagementStore from '@/stores/useCardsManagementStore.ts';

const useEditCard = (cardId: number) => {
  const [loading, setLoading] = useState(false);
  const [editingCard, setEditingCard] = useState<ICard | null>(null);
  const prevCard = useRef<ICard | null>(null);
  const cardChanged = useRef(false);

  const { cards, updateCard } = useCardsManagementStore((state) => ({
    cards: state.cards,
    updateCard: state.updateCard
  }))

  useAsyncEffect(async () => {
    setLoading(true);

    const card = cards.find(c => c.id === cardId);
    if (!card) {
      setLoading(false);
      return;
    }

    setEditingCard(card);
    prevCard.current = card;
    setLoading(false);
  }, [cardId]);

  useEffect(() => {
    if (!editingCard || !prevCard.current) return;
    const content = editingCard.content;
    const links = editingCard.links;
    const tags = editingCard.tags;

    cardChanged.current =
      JSON.stringify(content) !== JSON.stringify(prevCard.current.content) ||
      JSON.stringify(links) !== JSON.stringify(prevCard.current.links) ||
      JSON.stringify(tags) !== JSON.stringify(prevCard.current.tags);
  }, [editingCard]);

  const saveCard = useMemoizedFn(() => {
    if (!editingCard || !cardChanged.current) return;
    updateCard(editingCard).then(() => {
      prevCard.current = editingCard;
      cardChanged.current = false;
    });
  });

  const onContentChange = useMemoizedFn((content: Descendant[]) => {
    const newEditingCard = produce(editingCard, (draft) => {
      if (!draft) return;
      draft.content = content;
    });
    setEditingCard(newEditingCard);
  })

  return {
    loading,
    editingCard,
    onContentChange,
    saveCard
  }
}

export default useEditCard;