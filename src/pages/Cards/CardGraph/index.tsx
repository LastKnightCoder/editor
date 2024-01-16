import { useMemoizedFn } from "ahooks";

import LinkGraph from "@/components/LinkGraph";
import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";
import { ICard } from "@/types";

import { getInlineLinks } from "../CardsManagement/utils";

const CardGraph = () => {
  const { cards } = useCardsManagementStore(state => ({
    cards: state.cards,
  }));

  const getCardLinks = useMemoizedFn((card: ICard) => {
    const links = getInlineLinks(card);
    return [...new Set([...links, ...card.links])];
  });

  return (
    <LinkGraph
      cards={cards}
      style={{
        height: 'calc(100vh - 60px)',
      }}
      getCardLinks={getCardLinks}
    />
  )
}

export default CardGraph;