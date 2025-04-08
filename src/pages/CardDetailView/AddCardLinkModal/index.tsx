import { useEffect, useMemo, useState } from "react";

import { IExtension } from "@/components/Editor";
import ContentSelectorModal from "@/components/ContentSelectorModal";

import { getAllCards } from "@/commands";
import { ICard, IndexType, SearchResult } from "@/types";

interface IAddCardLinkModalProps {
  open: boolean;
  onClose: () => void;
  onOk: (selectedCards: ICard[]) => Promise<void>;
  editingCard: ICard;
}

const AddCardLinkModal = (props: IAddCardLinkModalProps) => {
  const { open, editingCard, onOk, onClose } = props;

  const [cards, setCards] = useState<ICard[]>([]);
  const [extensions, setExtensions] = useState<IExtension[]>([]);

  useEffect(() => {
    getAllCards().then((cards) => {
      setCards(cards);
    });
  }, []);

  useEffect(() => {
    import("@/editor-extensions").then(
      ({
        cardLinkExtension,
        fileAttachmentExtension,
        questionCardExtension,
      }) => {
        setExtensions([
          cardLinkExtension,
          fileAttachmentExtension,
          questionCardExtension,
        ]);
      },
    );
  }, []);

  const excludeCardIds = useMemo(() => {
    if (!editingCard) return [];
    return [editingCard.id, ...editingCard.links].filter(
      (id) => !!id,
    ) as number[];
  }, [editingCard]);

  const initialContents = useMemo(() => {
    return cards.map((card) => ({
      id: card.id,
      contentId: card.contentId,
      type: "card" as IndexType,
      title: "",
      content: card.content,
      source: "fts" as "fts" | "vec-document",
      updateTime: card.update_time,
    }));
  }, [cards]);

  const handleSelect = (selectedResults: SearchResult | SearchResult[]) => {
    const results = Array.isArray(selectedResults)
      ? selectedResults
      : [selectedResults];
    const selectedCardIds = results.map((result) => result.id);
    const newSelectedCards = selectedCardIds
      .map((id) => cards.find((card) => card.id === id))
      .filter((card): card is ICard => !!card);

    onOk(newSelectedCards);
  };

  if (!open) {
    return null;
  }

  return (
    <ContentSelectorModal
      title={"添加相关卡片"}
      open={open}
      onCancel={onClose}
      onSelect={handleSelect}
      contentType="card"
      multiple={true}
      excludeIds={excludeCardIds}
      initialContents={initialContents}
      extensions={extensions}
    />
  );
};

export default AddCardLinkModal;
