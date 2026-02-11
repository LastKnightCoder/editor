import { Trash2, Edit } from "lucide-react";
import { WhiteBoardContent } from "@/types";
import { App } from "antd";
import { memo, useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import styles from "./index.module.less";

const SUB_WHITEBOARD_DND_TYPE = "SUB_WHITEBOARD_ITEM";

interface SubWhiteBoardItemProps {
  item: WhiteBoardContent;
  index: number;
  isActive: boolean;
  onItemClick: (item: WhiteBoardContent) => void;
  onDelete: (id: number) => void;
  onEdit: (item: WhiteBoardContent) => void;
  onMove: (dragIndex: number, hoverIndex: number) => void;
  onDragEnd: () => void;
}

const SubWhiteBoardItem = memo(
  ({
    item,
    index,
    isActive,
    onItemClick,
    onDelete,
    onEdit,
    onMove,
    onDragEnd,
  }: SubWhiteBoardItemProps) => {
    const { modal } = App.useApp();
    const ref = useRef<HTMLDivElement>(null);

    const [{ isDragging }, drag] = useDrag({
      type: SUB_WHITEBOARD_DND_TYPE,
      item: { id: item.id, index },
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
      end: () => {
        onDragEnd();
      },
    });

    const [, drop] = useDrop({
      accept: SUB_WHITEBOARD_DND_TYPE,
      hover: (dragItem: { id: number; index: number }, monitor) => {
        if (!ref.current) return;
        const dragIndex = dragItem.index;
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
        dragItem.index = hoverIndex;
      },
    });

    drag(drop(ref));

    const handleDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      modal.confirm({
        title: "提示",
        content: "确定删除该子白板吗？",
        okText: "确定",
        cancelText: "取消",
        okButtonProps: {
          danger: true,
        },
        onOk: () => {
          onDelete(item.id);
        },
      });
    };

    const handleEdit = (e: React.MouseEvent) => {
      e.stopPropagation();
      onEdit(item);
    };

    return (
      <div
        ref={ref}
        className={`${styles.subWhiteBoardItem} ${isActive ? styles.active : ""}`}
        style={{
          opacity: isDragging ? 0.5 : 1,
          cursor: "grab",
        }}
        onClick={() => onItemClick(item)}
      >
        <span className={styles.name}>{item.name}</span>
        <div className={styles.actions}>
          <Edit size={20} className={styles.editButton} onClick={handleEdit} />
          <Trash2
            size={20}
            className={styles.deleteButton}
            onClick={handleDelete}
          />
        </div>
      </div>
    );
  },
);

export default SubWhiteBoardItem;
