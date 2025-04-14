import useEditCard from "./useEditCard.ts";
import { Skeleton } from "antd";
import { useRafInterval, useUnmount } from "ahooks";
import { memo, useRef } from "react";

import RichText, { RichtextRef } from "../RichText";
import { CardElement, CommonElement } from "../../plugins";
import { EHandlerPosition, Point, Board } from "../../types";
import { Descendant } from "slate";
import useEditContent from "@/hooks/useEditContent";
import { useWindowFocus } from "@/hooks/useWindowFocus";

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

  const isWindowFocused = useWindowFocus();
  const richtextRef = useRef<RichtextRef>(null);

  const { cardId, width, height } = element;

  const { loading, editingCard, saveCard, onContentChange } =
    useEditCard(cardId);

  useRafInterval(() => {
    saveCard();
  }, 500);

  useUnmount(() => {
    saveCard();
  });

  const { throttleHandleEditorContentChange } = useEditContent(
    editingCard?.contentId,
    (data) => {
      richtextRef.current?.setEditorValue(data);
    },
  );

  const handleOnContentChange = (
    _board: Board,
    _element: CardElement,
    value: Descendant[],
  ) => {
    onContentChange(value);
    if (isWindowFocused && richtextRef.current?.isFocus()) {
      throttleHandleEditorContentChange(value);
    }
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
