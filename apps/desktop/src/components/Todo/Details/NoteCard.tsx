import { useState, useRef, memo } from "react";
import { MdClose } from "react-icons/md";
import { useDrag, useDrop } from "react-dnd";
import { TodoNoteLink } from "@/types";
import { motion, AnimatePresence } from "motion/react";
import classNames from "classnames";
import { MdNote, MdArticle, MdFolder, MdDescription } from "react-icons/md";
import useTheme from "@/hooks/useTheme";

interface DragNoteItem {
  index: number;
  id: number;
  type: string;
}

const getTypeIcon = (type: TodoNoteLink["type"]) => {
  const iconProps = "w-4 h-4";
  switch (type) {
    case "card":
      return <MdNote className={`${iconProps} text-[var(--th-accent)]`} />;
    case "article":
      return <MdArticle className={`${iconProps} text-status-success`} />;
    case "project-item":
      return <MdFolder className={`${iconProps} text-orange-500`} />;
    case "document-item":
      return <MdDescription className={`${iconProps} text-[var(--th-accent)]`} />;
    case "custom":
    default:
      return <MdDescription className={`${iconProps} text-gray-500`} />;
  }
};

const NoteCard = memo(
  ({
    note,
    index,
    moveNote,
    onEdit,
    onDelete,
  }: {
    note: TodoNoteLink;
    index: number;
    moveNote: (dragIndex: number, hoverIndex: number) => void;
    onEdit: () => void;
    onDelete: () => void;
  }) => {
    const ref = useRef<HTMLDivElement | null>(null);
    const { isDark } = useTheme();
    const [hoveredItemId, setHoveredItemId] = useState<number | null>(null);

    const [{ handlerId }, drop] = useDrop<DragNoteItem, void, { handlerId: any }>({
      accept: "note",
      collect(monitor) {
        return {
          handlerId: monitor.getHandlerId(),
        };
      },
      hover(item: DragNoteItem, monitor) {
        if (!ref) return;
        const dragIndex = item.index;
        const hoverIndex = index;
        if (dragIndex === hoverIndex || !ref.current) return;

        const hoverBoundingRect = ref.current.getBoundingClientRect();
        const hoverMiddleX = (hoverBoundingRect.right - hoverBoundingRect.left) / 2;
        const clientOffset = monitor.getClientOffset();
        if (!clientOffset) return;
        const hoverClientX = clientOffset.x - hoverBoundingRect.left;

        if (dragIndex < hoverIndex && hoverClientX < hoverMiddleX) return;
        if (dragIndex > hoverIndex && hoverClientX > hoverMiddleX) return;

        moveNote(dragIndex, hoverIndex);
        item.index = hoverIndex;
      },
    });

    const [{ isDragging }, drag] = useDrag({
      type: "note",
      item: () => ({ id: note.id, index, type: "note" }),
      collect: monitor => ({ isDragging: monitor.isDragging() }),
    });

    const opacity = isDragging ? 0.4 : 1;

    drag(drop(ref));

    return (
      <div
        ref={ref}
        style={{ opacity }}
        data-handler-id={handlerId}
        className="group relative cursor-move rounded text-xs"
        onClick={onEdit}
        onMouseEnter={() => setHoveredItemId(note.id)}
        onMouseLeave={() => setHoveredItemId(null)}
      >
        <motion.div
          className={classNames(
            "group relative flex min-w-0 flex-none cursor-pointer items-center gap-2 overflow-visible rounded border border-gray-200 px-2 py-1 transition-all hover:border-[var(--th-border-hover)] hover:bg-[var(--th-accent-soft)]",
            {
              "border-gray-700 bg-zinc-800 hover:border-gray-600 hover:bg-zinc-700": isDark,
            }
          )}
          onClick={onEdit}
        >
          <div className="flex flex-none items-center">{getTypeIcon(note.type)}</div>

          <span className="max-w-24 truncate text-[12px]" title={note.title}>
            {note.title}
          </span>

          <AnimatePresence>
            {hoveredItemId === note.id && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className={classNames(
                  "absolute -right-1 -top-1 z-10 flex h-3 w-3 cursor-pointer items-center justify-center rounded-full bg-red-500 shadow-lg",
                  {
                    "bg-red-700": isDark,
                  }
                )}
                onClick={e => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <MdClose className="h-2 w-2 text-white" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    );
  }
);

export default NoteCard;
