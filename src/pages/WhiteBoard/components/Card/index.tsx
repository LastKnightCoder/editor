import useEditCard from "./useEditCard.ts";
import { Skeleton } from "antd";
import { useRafInterval, useUnmount } from "ahooks";
import { memo } from "react";
import RichText from "../RichText";

interface CardProps {
  elementId: string;
  cardId: number;
  x: number;
  y: number;
  width: number;
  height: number;
  maxWidth: number;
  maxHeight: number;
  resized: boolean;
  onResize: (width: number, height: number) => void;
  readonly?: boolean;
  paddingWidth?: number;
  paddingHeight?: number;
  borderWidth?: number;
  borderColor?: string;
}

const Card = memo((props: CardProps) => {
  const {
    elementId,
    cardId,
    x,
    y,
    width,
    height,
    maxWidth,
    maxHeight,
    resized,
    onResize,
    readonly,
    borderWidth,
    borderColor,
    paddingWidth,
    paddingHeight,
  } = props;

  const {
    loading,
    editingCard,
    saveCard,
    onContentChange
  } = useEditCard(cardId);

  useRafInterval(() => {
    saveCard();
  }, 3000)

  useUnmount(() => {
    saveCard();
  });

  if (loading) {
    return (
      <div style={{ width, height }}>
        <Skeleton paragraph={{ rows: 4 }} />
      </div>
    )
  }

  if (!editingCard) return null;

  return (
    <RichText
      elementId={elementId}
      x={x}
      y={y}
      width={width}
      height={height}
      maxWidth={maxWidth}
      maxHeight={maxHeight}
      resized={resized}
      onResize={onResize}
      content={editingCard.content}
      onChange={onContentChange}
      borderWidth={borderWidth}
      borderColor={borderColor}
      paddingWidth={paddingWidth}
      paddingHeight={paddingHeight}
      readonly={readonly}
    />
  )
});

export default Card;
