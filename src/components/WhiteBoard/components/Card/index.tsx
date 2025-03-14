import useEditCard from "./useEditCard.ts";
import { Skeleton } from "antd";
import { useRafInterval, useUnmount } from "ahooks";
import { memo } from "react";

import RichText from "../RichText";
import { CardElement, CommonElement } from "../../plugins";
import { EHandlerPosition, Point, Board } from "../../types";
import { Descendant } from "slate";

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

  const { cardId, width, height } = element;

  const { loading, editingCard, saveCard, onContentChange } =
    useEditCard(cardId);

  useRafInterval(() => {
    saveCard();
  }, 3000);

  useUnmount(() => {
    saveCard();
  });

  const handleOnContentChange = (
    _board: Board,
    _element: CardElement,
    value: Descendant[],
  ) => {
    onContentChange(value);
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
      onEditorSizeChange={onEditorSizeChange}
      onContentChange={handleOnContentChange}
      onResizeStart={onResizeStart}
      onResizeEnd={onResizeEnd}
      onResize={onResize}
    />
  );
});

export default Card;
