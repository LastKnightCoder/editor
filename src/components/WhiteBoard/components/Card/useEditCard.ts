import { useRef, useState } from "react";
import { ICard } from "@/types";
import { useAsyncEffect, useMemoizedFn } from "ahooks";
import { Descendant } from "slate";
import { produce } from "immer";
import { getCardById, updateCard } from "@/commands";

const useEditCard = (cardId: number) => {
  const [loading, setLoading] = useState(false);
  const [editingCard, setEditingCard] = useState<ICard | null>(null);
  const prevCard = useRef<ICard | null>(null);

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

  const saveCard = useMemoizedFn(() => {
    if (!editingCard) return;
    if (!editingCard || !prevCard.current) return;
    const content = editingCard.content;
    const links = editingCard.links;
    const tags = editingCard.tags;

    const cardChanged =
      JSON.stringify(content) !== JSON.stringify(prevCard.current.content) ||
      JSON.stringify(links) !== JSON.stringify(prevCard.current.links) ||
      JSON.stringify(tags) !== JSON.stringify(prevCard.current.tags);

    if (!cardChanged) return;

    updateCard(editingCard).then(() => {
      prevCard.current = editingCard;
    });
  });

  const onContentChange = useMemoizedFn((content: Descendant[]) => {
    const newEditingCard = produce(editingCard, (draft) => {
      if (!draft) return;
      draft.content = content;
    });
    setEditingCard(newEditingCard);
  });

  return {
    loading,
    editingCard,
    onContentChange,
    saveCard,
  };
};

export default useEditCard;
