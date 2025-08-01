import React, { useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import { VideoNote as VideoNoteType } from "@/types";
import SlideCard from "../SlideCard";
import { ItemTypes } from "../../constants";
import classnames from "classnames";
import styles from "./index.module.less";

interface DraggableSlideCardProps {
  note: VideoNoteType["notes"][0];
  isActive: boolean;
  formatTime: (time: number) => string;
  onClick: (id: string) => void;
  onDelete: (id: string) => void;
  style?: React.CSSProperties;
  isSelectionMode: boolean;
  isSelected: boolean;
  onSelect: (id: string) => void;
  moveCard: (dragId: string, hoverId: string) => void;
}

interface DragItem {
  id: string;
  type: string;
}

const DraggableSlideCard: React.FC<DraggableSlideCardProps> = ({
  note,
  isActive,
  formatTime,
  onClick,
  onDelete,
  style,
  isSelectionMode,
  isSelected,
  onSelect,
  moveCard,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  const [{ handlerId }, drop] = useDrop<
    DragItem,
    void,
    { handlerId: string | symbol | null }
  >(
    {
      accept: ItemTypes.SLIDE_CARD,
      collect: (monitor) => ({
        handlerId: monitor.getHandlerId(),
      }),
      canDrop: (item) => {
        return item.id !== note.id;
      },
      hover: (item) => {
        const dragId = item.id;
        const hoverId = note.id;

        // 相同项不做处理
        if (dragId === hoverId) {
          return;
        }

        // 执行拖拽排序
        moveCard(dragId, hoverId);
      },
    },
    [note.id],
  );

  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.SLIDE_CARD,
    item: () => ({
      id: note.id,
    }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    canDrag: () => !isSelectionMode,
  });

  drag(drop(ref));

  return (
    <div
      ref={ref}
      style={{
        ...style,
        opacity: isDragging ? 0.4 : 1,
      }}
      data-handler-id={handlerId}
      className={classnames(styles.cardWrapper, {
        [styles.dragging]: isDragging,
      })}
    >
      <SlideCard
        note={note}
        isActive={isActive}
        formatTime={formatTime}
        onClick={onClick}
        onDelete={onDelete}
        style={{ width: "100%" }}
        isSelectionMode={isSelectionMode}
        isSelected={isSelected}
        onSelect={onSelect}
      />
    </div>
  );
};

export default React.memo(DraggableSlideCard);
