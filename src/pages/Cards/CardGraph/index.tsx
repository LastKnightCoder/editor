import { useMemoizedFn } from "ahooks";

import LinkGraph from "@/components/LinkGraph";
import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";
import useCardPanelStore, { EActiveSide } from "@/stores/useCardPanelStore";
import { ICard } from "@/types";

import { getInlineLinks } from "../CardsManagement/utils";

const CardGraph = () => {
  const { cards } = useCardsManagementStore(state => ({
    cards: state.cards,
  }));

  const {
    addCardToSide,
  } = useCardPanelStore(state => ({
    addCardToSide: state.addCardToSide,
  }))

  const getCardLinks = useMemoizedFn((card: ICard) => {
    const links = getInlineLinks(card);
    return [...new Set([...links, ...card.links])];
  });

  const onClickCard = useMemoizedFn((id: number) => {
    addCardToSide(id, EActiveSide.Left);
  });

  return (
    <LinkGraph
      cards={cards}
      style={{
        height: 'calc(100vh - 60px)',
      }}
      getCardLinks={getCardLinks}
      onClickCard={onClickCard}
    />
  )
}

export default CardGraph;