import { Descendant } from "slate";
import { useEffect, useState, useRef } from "react";
import { useAsyncEffect, useMemoizedFn } from 'ahooks';
import { produce } from 'immer';
import useCardsManagementStore from '@/stores/useCardsManagementStore.ts';
import { ICard } from "@/types";

const useEditCard = (cardId: number) => {
  const [loading, setLoading] = useState(false);
  const [editingCard, setEditingCard] = useState<ICard | null>(null);
  const prevCard = useRef<ICard | null>(null);
  const cardChanged = useRef(false);
  const [readonly, setReadonly] = useState(true);
  const [initValue, setInitValue] = useState<Descendant[]>([{
    type: 'paragraph',
    children: [{
      type: 'formatted',
      text: ''
    }],
  }]);
  const timer = useRef<number>();

  const { cards, updateCard } = useCardsManagementStore((state) => ({
    cards: state.cards,
    updateCard: state.updateCard,
  }));

  useAsyncEffect(async () => {
    setLoading(true);
    const card = cards.find(c => c.id === cardId);
    if (!card) {
      console.error('Card not found');
      setLoading(false);
      return;
    }

    setEditingCard(card);
    prevCard.current = card;
    setInitValue(card.content);
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
    if (timer.current) {
      clearTimeout(timer.current);
    }
    const newEditingCard = produce(editingCard, (draft) => {
      if (!draft) return;
      draft.content = content;
    });
    setEditingCard(newEditingCard);
    // @ts-ignore
    timer.current = setTimeout(() => {
      saveCard();
    }, 1000);
  })

  const onAddTag = useMemoizedFn((tag: string) => {
    if (!editingCard || editingCard.tags.includes(tag)) return;
    const newEditingCard = produce(editingCard, (draft) => {
      draft.tags.push(tag);
    });
    setEditingCard(newEditingCard);
  })

  const onDeleteTag = useMemoizedFn((tag: string) => {
    if (!editingCard || !editingCard.tags.includes(tag)) return;
    const newEditingCard = produce(editingCard, (draft) => {
      draft.tags = draft.tags.filter(t => t !== tag);
    });
    setEditingCard(newEditingCard);
  })

  const onAddLink = useMemoizedFn(async (link: number) => {
    if (!editingCard || editingCard.links.includes(link)) return;
    const newEditingCard = produce(editingCard, (draft) => {
      draft.links.push(link);
    });
    const linkedCard = cards.find(c => c.id === link);
    if (linkedCard) {
      if (linkedCard.links.includes(editingCard.id)) return;
      const newLinkedCard = produce(linkedCard, (draft) => {
        draft.links.push(editingCard.id);
      });
      await updateCard(newLinkedCard);
    }
    setEditingCard(newEditingCard);
  })

  const onRemoveLink = useMemoizedFn(async (link: number) => {
    if (!editingCard || !editingCard.links.includes(link)) return;
    const newEditingCard = produce(editingCard, (draft) => {
      draft.links = draft.links.filter(l => l !== link);
    });
    const linkedCard = cards.find(c => c.id === link);
    if (linkedCard) {
      const newLinkedCard = produce(linkedCard, (draft) => {
        draft.links = draft.links.filter(l => l !== editingCard.id);
      });
      await updateCard(newLinkedCard);
    }
    setEditingCard(newEditingCard);
  })

  return {
    loading,
    editingCard,
    saveCard,
    readonly,
    onContentChange,
    onAddTag,
    onDeleteTag,
    onAddLink,
    onRemoveLink,
    setReadonly,
    initValue,
  }
}

export default useEditCard;