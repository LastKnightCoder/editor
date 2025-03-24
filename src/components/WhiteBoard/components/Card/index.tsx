import useEditCard from "./useEditCard.ts";
import { Skeleton } from "antd";
import { useCreation, useRafInterval, useUnmount } from "ahooks";
import { memo, useEffect, useRef } from "react";

import RichText, { RichtextRef } from "../RichText";
import { CardElement, CommonElement } from "../../plugins";
import { EHandlerPosition, Point, Board } from "../../types";
import { Descendant } from "slate";
import { defaultCardEventBus } from "@/utils/event-bus/card-event-bus.ts";

interface CardProps {
  element: CardElement;
  onEditorSizeChange: (
    board: Board,
    element: CardElement,
    width: number,
    height: number,
  ) => void;
  onResizeStart?: (element: CommonElement & any) => void;
  onResizeEnd?: (
    board: Board,
    element: CommonElement & any,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
  ) => void;
  onResize: (
    board: Board,
    element: CommonElement & any,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    isPreserveRatio?: boolean,
    isAdsorb?: boolean,
  ) => void;
}

const Card = memo((props: CardProps) => {
  const { element, onEditorSizeChange, onResizeStart, onResizeEnd, onResize } =
    props;

  const richtextRef = useRef<RichtextRef>(null);
  const cardEventBus = useCreation(
    () => defaultCardEventBus.createEditor(),
    [],
  );

  const { cardId, width, height } = element;

  const { loading, editingCard, saveCard, onContentChange } =
    useEditCard(cardId);

  useRafInterval(() => {
    saveCard();
  }, 3000);

  useUnmount(() => {
    saveCard();
  });

  useEffect(() => {
    const unsubscribe = cardEventBus.subscribeToCardWithId(
      "card:updated",
      cardId,
      (data) => {
        richtextRef.current?.setEditorValue(data.card.content);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [cardId]);

  const handleOnContentChange = (
    _board: Board,
    _element: CardElement,
    value: Descendant[],
  ) => {
    if (!richtextRef.current?.isFocus() || !editingCard) return;
    onContentChange(value);
    cardEventBus.publishCardEvent("card:updated", {
      ...editingCard,
      content: value,
    });
  };

  if (loading) {
    return (
      <div style={{ width, height }}>
        <Skeleton paragraph={{ rows: 4 }} />
      </div>
    );
  }

  if (!editingCard) return null;

  return (
    <RichText
      element={{
        ...element,
        content: editingCard.content,
      }}
      ref={richtextRef}
      onEditorSizeChange={onEditorSizeChange}
      onContentChange={handleOnContentChange}
      onResizeStart={onResizeStart}
      onResizeEnd={onResizeEnd}
      onResize={onResize}
    />
  );
});

export default Card;
