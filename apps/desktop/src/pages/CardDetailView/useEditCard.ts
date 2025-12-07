import { Descendant, Editor } from "slate";
import { useState, useRef } from "react";
import { useAsyncEffect, useMemoizedFn, useThrottleFn } from "ahooks";
import { produce } from "immer";

import { ICard } from "@/types";
import { getCardById, updateCard } from "@/commands";
import { getContentLength } from "@/utils";
const useEditCard = (cardId: number | undefined) => {
  const [loading, setLoading] = useState(false);
  const [editingCard, setEditingCard] = useState<ICard | null>(null);
  const prevCard = useRef<ICard | null>(null);
  const [initValue, setInitValue] = useState<Descendant[]>([
    {
      type: "paragraph",
      children: [{ type: "formatted", text: "" }],
    },
  ]);

  useAsyncEffect(async () => {
    if (!cardId) return;
    setLoading(true);

    const card = await getCardById(cardId);
    if (!card) {
      setLoading(false);
      return;
    }

    setEditingCard(card);
    setInitValue(card.content);
    prevCard.current = card;
    setLoading(false);
  }, [cardId]);

  const saveCard = useMemoizedFn(async () => {
    if (!editingCard) return null;

    // 不比较 content 和 count
    const cardChanged =
      JSON.stringify({
        ...editingCard,
        content: undefined,
        count: undefined,
      }) !==
      JSON.stringify({
        ...prevCard.current,
        content: undefined,
        count: undefined,
      });

    if (!cardChanged) return null;

    const updatedCard = await updateCard(editingCard);
    prevCard.current = updatedCard;
    setEditingCard(updatedCard);
    return updatedCard;
  });

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

  const onInit = useMemoizedFn((editor: Editor, content: Descendant[]) => {
    if (!editor || !editingCard) return;
    const newEditingCard = produce(editingCard, (draft) => {
      draft.content = content;
      draft.count = getContentLength(content);
    });
    setEditingCard(newEditingCard);
  });

  const { run: onContentChange } = useThrottleFn((content: Descendant[]) => {
    if (!editingCard) return;
    const newEditingCard = produce(editingCard, (draft) => {
      draft.content = content;
      draft.count = getContentLength(content);
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
    onAddLinks([link]);
  });

  const onAddLinks = useMemoizedFn(async (links: number[]) => {
    if (!editingCard) return;
    const newEditingCard = produce(editingCard, (draft) => {
      draft.links = [...new Set([...draft.links, ...links])];
    });

    for (const link of links) {
      const linkedCard = await getCardById(link);
      if (linkedCard && !linkedCard.links.includes(editingCard.id)) {
        const newLinkedCard = produce(linkedCard, (draft) => {
          draft.links.push(editingCard.id);
        });
        await updateCard(newLinkedCard);
      }
    }
    setEditingCard(newEditingCard);
  });

  const onRemoveLink = useMemoizedFn(async (link: number) => {
    if (!editingCard || !editingCard.links.includes(link)) return;
    const newEditingCard = produce(editingCard, (draft) => {
      draft.links = draft.links.filter((l) => l !== link);
    });
    const linkedCard = await getCardById(link);
    if (linkedCard) {
      const newLinkedCard = produce(linkedCard, (draft) => {
        draft.links = draft.links.filter((l) => l !== editingCard.id);
      });
      await updateCard(newLinkedCard);
    }
    setEditingCard(newEditingCard);
  });

  return {
    initValue,
    loading,
    editingCard,
    onContentChange,
    onInit,
    saveCard,
    onAddTag,
    onDeleteTag,
    onAddLink,
    onRemoveLink,
    onTagChange,
    onAddLinks,
    setEditingCard,
    prevCard,
  };
};

export default useEditCard;
