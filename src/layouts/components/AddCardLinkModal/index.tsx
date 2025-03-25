import { useEffect, useMemo, useState } from "react";

import SelectCardModal from "@/components/SelectCardModal";

import { ICard } from "@/types";
import { getAllCards } from "@/commands";

interface IAddCardLinkModalProps {
  open: boolean;
  onClose: () => void;
  onOk: (selectedCards: ICard[]) => Promise<void>;
  editingCard: ICard;
}

const AddCardLinkModal = (props: IAddCardLinkModalProps) => {
  const { open, editingCard, onOk, onClose } = props;

  const [cards, setCards] = useState<ICard[]>([]);

  useEffect(() => {
    getAllCards().then((cards) => {
      setCards(cards);
    });
  }, []);

  const excludeCardIds = useMemo(() => {
    if (!editingCard) return [];
    return [editingCard.id, ...editingCard.links].filter(
      (id) => !!id,
    ) as number[];
  }, [editingCard]);

  const [selectedCards, setSelectedCards] = useState<ICard[]>(() => {
    if (!editingCard) return [];
    return editingCard.links
      .map((id) => cards.find((card) => card.id === id))
      .filter((card) => !!card) as ICard[];
  });

  const onCloseModal = () => {
    onClose();
  };

  if (!open) {
    return null;
  }

  return (
    <SelectCardModal
      title={"添加相关卡片"}
      selectedCards={selectedCards}
      onChange={setSelectedCards}
      open={open}
      multiple
      onOk={onOk}
      onCancel={onCloseModal}
      allCards={cards}
      excludeCardIds={excludeCardIds}
    />
  );
};

export default AddCardLinkModal;
