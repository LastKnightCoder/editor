import { useRef } from 'react';
import { useDrag, useDrop } from "react-dnd";
import useCardPanelStore from "@/stores/useCardPanelStore.ts";

interface IUseDragAndDropParams {
  cardId: number;
}

const CARD_TAB_TYPE = 'card-tab';

const useDragAndDrop = (params: IUseDragAndDropParams) => {
  const { cardId } = params;
  const ref = useRef(null);

  const {
    dragCard,
  } = useCardPanelStore((state) => ({
    dragCard: state.dragCard,
  }));

  const [{ isDragging }, drag] = useDrag({
    type: CARD_TAB_TYPE,
    item: {
      cardId,
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [{ isOver, canDrop }, drop] = useDrop<{ cardId: number }, void, {
    isOver: boolean;
    canDrop: boolean;
  }>({
    accept: CARD_TAB_TYPE,
    canDrop: (item) => {
      return item.cardId !== cardId;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
    hover: (item, monitor) => {
      const canDrop = monitor.canDrop();
      if (!canDrop) {
        return;
      }
      if (item.cardId === cardId) {
        return;
      }
      dragCard(item.cardId, cardId);
    },
    drop: (item) => {
      dragCard(item.cardId, cardId);
    }
  });

  drag(drop(ref));

  return {
    ref,
    isDragging,
    canDrop,
    isOver,
  }
}

export default useDragAndDrop;