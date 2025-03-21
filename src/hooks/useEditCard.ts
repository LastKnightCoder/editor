import { Descendant, Editor } from "slate";
import { useEffect, useState, useRef } from "react";
import { useAsyncEffect, useMemoizedFn } from "ahooks";
import { produce } from "immer";

import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";
import { ICard } from "@/types";
import { getContentLength } from "@/utils";

const useEditCard = (cardId: number | undefined) => {
  const [loading, setLoading] = useState(false);
  const [editingCard, setEditingCard] = useState<ICard | null>(null);
  const prevCard = useRef<ICard | null>(null);
  const cardChanged = useRef(false);

  const { cards, updateCard } = useCardsManagementStore((state) => ({
    cards: state.cards,
    updateCard: state.updateCard,
  }));

  useAsyncEffect(async () => {
    if (!cardId) return;
    setLoading(true);

    const card = cards.find((c) => c.id === cardId);
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

  const onInit = useMemoizedFn((editor: Editor, content: Descendant[]) => {
    if (!editor) return;
    const wordsCount = getContentLength(content);
    const newEditingCard = produce(editingCard, (draft) => {
      if (!draft) return;
      draft.count = wordsCount;
    });
    setEditingCard(newEditingCard);
  });

  const onContentChange = useMemoizedFn(
    (content: Descendant[], editor?: Editor) => {
      if (!editor) return;
      const wordsCount = getContentLength(content);
      const newEditingCard = produce(editingCard, (draft) => {
        if (!draft) return;
        draft.content = content;
        draft.count = wordsCount;
      });
      setEditingCard(newEditingCard);
    },
  );

  const onAddTag = useMemoizedFn((tag: string) => {
    if (!editingCard || editingCard.tags.includes(tag)) return;
    const newEditingCard = produce(editingCard, (draft) => {
      draft.tags.push(tag);
    });
    setEditingCard(newEditingCard);
  });

  const onDeleteTag = useMemoizedFn((tag: string) => {
    if (!editingCard || !editingCard.tags.includes(tag)) return;
    const newEditingCard = produce(editingCard, (draft) => {
      draft.tags = draft.tags.filter((t) => t !== tag);
    });
    setEditingCard(newEditingCard);
  });

  const onTagChange = useMemoizedFn((tags: string[]) => {
    if (!editingCard) return;
    const newEditingCard = produce(editingCard, (draft) => {
      draft.tags = tags;
    });
    setEditingCard(newEditingCard);
  });

  const onAddLink = useMemoizedFn(async (link: number) => {
    if (!editingCard || editingCard.links.includes(link)) return;
    const newEditingCard = produce(editingCard, (draft) => {
      draft.links.push(link);
    });
    const linkedCard = cards.find((c) => c.id === link);
    if (linkedCard) {
      if (linkedCard.links.includes(editingCard.id)) return;
      const newLinkedCard = produce(linkedCard, (draft) => {
        draft.links.push(editingCard.id);
      });
      await updateCard(newLinkedCard);
    }
    setEditingCard(newEditingCard);
  });

  const onRemoveLink = useMemoizedFn(async (link: number) => {
    if (!editingCard || !editingCard.links.includes(link)) return;
    const newEditingCard = produce(editingCard, (draft) => {
      draft.links = draft.links.filter((l) => l !== link);
    });
    const linkedCard = cards.find((c) => c.id === link);
    if (linkedCard) {
      const newLinkedCard = produce(linkedCard, (draft) => {
        draft.links = draft.links.filter((l) => l !== editingCard.id);
      });
      await updateCard(newLinkedCard);
    }
    setEditingCard(newEditingCard);
  });

  return {
    loading,
    editingCard,
    saveCard,
    onInit,
    onContentChange,
    onAddTag,
    onDeleteTag,
    onAddLink,
    onRemoveLink,
    onTagChange,
  };
};

export default useEditCard;
