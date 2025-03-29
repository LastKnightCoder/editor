import React, { memo } from "react";
import classnames from "classnames";
import { VideoNote as VideoNoteType } from "@/types";
import styles from "./index.module.less";
import Editor from "@/components/Editor";
import { useTheme } from "../../ThemeContext";
import { App } from "antd";
import { useDrag } from "react-dnd";
import { ItemTypes } from "../../constants";

interface SlideCardProps {
  note: VideoNoteType["notes"][0];
  isActive: boolean;
  formatTime: (time: number) => string;
  onClick: (id: string) => void;
  onDelete: (id: string) => void;
  className?: string;
  style?: React.CSSProperties;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
}

const SlideCard: React.FC<SlideCardProps> = memo(
  ({
    note,
    isActive,
    formatTime,
    onClick,
    onDelete,
    className,
    style,
    isSelectionMode = false,
    isSelected = false,
    onSelect,
  }) => {
    const theme = useTheme();
    const { modal } = App.useApp();

    const handleDelete = (e: React.MouseEvent) => {
      e.stopPropagation();

      modal.confirm({
        title: "确认删除",
        content: "确定要删除这条笔记吗？",
        okText: "确认",
        okButtonProps: {
          danger: true,
        },
        cancelText: "取消",
        onOk: () => onDelete(note.id),
      });
    };

    const handleSelect = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onSelect) {
        onSelect(note.id);
      }
    };

    const [{ isDragging }, drag] = useDrag(() => ({
      type: ItemTypes.SLIDE_CARD,
      item: { id: note.id },
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
      canDrag: () => !isSelectionMode, // 在选择模式下禁用拖拽
    }));

    return (
      <div
        ref={drag}
        className={classnames(
          styles.slideCard,
          {
            [styles.activeSlide]: isActive,
            [styles.dark]: theme === "dark",
            [styles.dragging]: isDragging,
            [styles.selected]: isSelected,
            [styles.selectionMode]: isSelectionMode,
          },
          className,
        )}
        style={style}
        onClick={() => onClick(note.id)}
      >
        {isSelectionMode && (
          <div className={styles.checkboxWrapper} onClick={handleSelect}>
            <div
              className={classnames(styles.checkbox, {
                [styles.checked]: isSelected,
              })}
            >
              {isSelected && <span className={styles.checkmark}>✓</span>}
            </div>
          </div>
        )}
        <div className={styles.slideTime}>{formatTime(note.startTime)}</div>
        <div className={styles.slidePreview}>
          <Editor
            key={JSON.stringify(note.content.slice(0, 2))}
            initValue={note.content.slice(0, 2)}
            readonly={true}
          />
        </div>
        <div className={styles.cardActions}>
          <div className={styles.slideWordCount}>{note.count} 字</div>
          <button
            className={styles.deleteButton}
            onClick={handleDelete}
            title="删除"
          >
            ×
          </button>
        </div>
      </div>
    );
  },
);

SlideCard.displayName = "SlideCard";

export default SlideCard;
