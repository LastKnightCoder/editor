import { motion } from "motion/react";
import { Move, X } from "lucide-react";
import { IconButton, cn } from "@tau/ui";
import { ImageGalleryItem } from "../../../../../types";
import useDragAndDrop from "./useDragAndDrop";
import { useEditorSlots } from "../../../../../services/hooks";

interface IImageItemProps {
  imageItem: ImageGalleryItem;
  index: number;
  onDelete: (item: ImageGalleryItem) => void;
  onDrop: (dragImageItem: ImageGalleryItem, dropImageItem: ImageGalleryItem) => void;
}

const ImageItem = (props: IImageItemProps) => {
  const { imageItem, index, onDelete, onDrop } = props;

  const { ref, isDragging, isOver, canDrop } = useDragAndDrop({
    imageItem,
    index,
    onDrop,
  });

  const { Image } = useEditorSlots();

  return (
    <motion.div
      ref={ref}
      layout
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={cn(
        "bg-sunken rounded-tau-md hover:ring-line-2 group relative aspect-square cursor-move overflow-hidden ring-2 ring-transparent transition-[box-shadow,opacity] duration-200",
        isDragging && "ring-accent hover:ring-accent opacity-50",
        isOver && canDrop && "ring-accent hover:ring-accent scale-105"
      )}
    >
      {/* Image */}
      {Image ? (
        <Image
          url={imageItem.url}
          alt={imageItem.desc || ""}
          className="h-full w-full object-cover"
        />
      ) : (
        <img
          src={imageItem.url}
          alt={imageItem.desc || ""}
          className="h-full w-full object-cover"
        />
      )}

      <div className="group-hover:bg-overlay/50 pointer-events-none absolute inset-0 transition-colors duration-200" />

      <IconButton
        onClick={e => {
          e.stopPropagation();
          onDelete(imageItem);
        }}
        aria-label="删除图片"
        title="删除图片"
        className="bg-surface/90 text-ink-2 shadow-float enabled:hover:bg-danger enabled:hover:text-ink-inverse absolute right-1.5 top-1.5 size-6 rounded-full opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X className="size-3.5" />
      </IconButton>

      {isDragging && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="bg-accent text-ink-inverse grid size-8 place-items-center rounded-full">
            <Move className="size-4" />
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default ImageItem;
