import { useEffect, useRef, useState } from "react";
import { ICard } from "@/types";

import { getCardById, updateCard } from '@/commands';
import { useAsyncEffect, useMemoizedFn } from "ahooks";
import { Descendant } from "slate";
import { produce } from "immer";

const useEditCard = (cardId: number) => {
  const [loading, setLoading] = useState(false);
  const [editingCard, setEditingCard] = useState<ICard | null>(null);
  const prevCard = useRef<ICard | null>(null);
  const cardChanged = useRef(false);

  useAsyncEffect(async () => {
    setLoading(true);

    const card = await getCardById(cardId);
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