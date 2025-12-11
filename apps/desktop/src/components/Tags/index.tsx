import classnames from "classnames";
import { ReactNode, useRef, useCallback } from "react";
import { useDrag, useDrop } from "react-dnd";

import Tag from "./Tag";
import styles from "./index.module.less";

const TAG_DND_TYPE = "TAG_ITEM";

interface DraggableTagProps {
  tag: string;
  index: number;
  closable?: boolean;
  onClose?: () => void;
  onClick?: () => void;
  showIcon?: boolean;
  showSharp?: boolean;
  hoverAble?: boolean;
  style?: React.CSSProperties;
  isEditing?: boolean;
  editRef?: React.RefObject<HTMLDivElement>;
  onEditBlur?: () => void;
  onMove: (dragIndex: number, hoverIndex: number) => void;
  draggable?: boolean;
}

const DraggableTag = ({
  tag,
  index,
  closable,
  onClose,
  onClick,
  showIcon,
  showSharp,
  hoverAble,
  style,
  isEditing,
  editRef,
  onEditBlur,
  onMove,
  draggable = false,
}: DraggableTagProps) => {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag] = useDrag({
    type: TAG_DND_TYPE,
    item: { index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    canDrag: draggable && !isEditing,
  });

  const [, drop] = useDrop({
    accept: TAG_DND_TYPE,
    hover: (item: { index: number }, monitor) => {
      if (!ref.current || !draggable) return;

      const dragIndex = item.index;
      const hoverIndex = index;

      if (dragIndex === hoverIndex) return;

      const hoverBoundingRect = ref.current.getBoundingClientRect();
      const hoverMiddleX =
        (hoverBoundingRect.right - hoverBoundingRect.left) / 2;
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;
      const hoverClientX = clientOffset.x - hoverBoundingRect.left;

      if (dragIndex < hoverIndex && hoverClientX < hoverMiddleX) return;
      if (dragIndex > hoverIndex && hoverClientX > hoverMiddleX) return;

      onMove(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

  if (draggable) {
    drag(drop(ref));
  }

  return (
    <div
      ref={draggable ? ref : undefined}
      style={{
        opacity: isDragging ? 0.5 : 1,
        cursor: draggable && !isEditing ? "grab" : undefined,
      }}
    >
      <Tag
        tag={tag}
        closable={closable}
        onClose={onClose}
        onClick={onClick}
        showIcon={showIcon}
        showSharp={showSharp}
        hoverAble={hoverAble}
        style={style}
        isEditing={isEditing}
        editRef={editRef}
        onEditBlur={onEditBlur}
      />
    </div>
  );
};

interface TagsProps {
  tags: string[];
  closable?: boolean;
  onClose?: (tag: string) => void;
  className?: string;
  style?: React.CSSProperties;
  noWrap?: boolean;
  onClick?: (tag: string) => void;
  showIcon?: boolean;
  showSharp?: boolean;
  hoverAble?: boolean;
  lastChild?: ReactNode;
  tagStyle?: React.CSSProperties;
  editingTag?: string | null;
  editRef?: React.RefObject<HTMLDivElement>;
  onEditBlur?: () => void;
  // 拖拽排序相关
  draggable?: boolean;
  onReorder?: (newTags: string[]) => void;
}

const Tags = (props: TagsProps) => {
  const {
    tags,
    showSharp,
    showIcon,
    closable,
    onClose,
    onClick,
    className,
    style,
    noWrap = false,
    hoverAble = false,
    lastChild,
    tagStyle,
    editingTag,
    editRef,
    onEditBlur,
    draggable = false,
    onReorder,
  } = props;

  const handleMove = useCallback(
    (dragIndex: number, hoverIndex: number) => {
      if (!onReorder) return;
      const filteredTags = tags.filter((tag) => !!tag);
      const newTags = [...filteredTags];
      const [draggedTag] = newTags.splice(dragIndex, 1);
      newTags.splice(hoverIndex, 0, draggedTag);
      onReorder(newTags);
    },
    [tags, onReorder],
  );

  if (!lastChild && (!tags || tags.length === 0)) {
    return null;
  }

  const tagsClassName = classnames(
    styles.tags,
    {
      [styles.noWrap]: noWrap,
    },
    className,
  );

  const filteredTags = tags.filter((tag) => !!tag);

  return (
    <div className={tagsClassName} style={style}>
      {filteredTags.map((tag, index) => {
        const isCurrentlyEditing = editingTag === tag;
        return (
          <DraggableTag
            key={tag}
            tag={tag}
            index={index}
            closable={closable}
            onClose={() => onClose && onClose(tag)}
            onClick={() => onClick && onClick(tag)}
            showIcon={showIcon}
            showSharp={showSharp}
            hoverAble={hoverAble}
            style={tagStyle}
            isEditing={isCurrentlyEditing}
            editRef={isCurrentlyEditing ? editRef : undefined}
            onEditBlur={isCurrentlyEditing ? onEditBlur : undefined}
            onMove={handleMove}
            draggable={draggable && !!onReorder}
          />
        );
      })}
      {lastChild}
    </div>
  );
};

export default Tags;
