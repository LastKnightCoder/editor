import LinkGraph from "@/components/LinkGraph";

import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";

const CardGraph = () => {
  const { cards } = useCardsManagementStore(state => ({
    cards: state.cards,
  }));

  return (
    <LinkGraph cards={cards} style={{
      height: 'calc(100vh - 64px)',
    }} />
  )
}

export default CardGraph;