import { motion } from "motion/react";
import { MdClose } from "react-icons/md";
import { ImageGalleryItem } from "../../../../../types/index";
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
      className={`group relative aspect-square cursor-move overflow-hidden rounded-xl bg-gray-100 ring-2 ring-transparent transition-colors duration-200 dark:bg-zinc-800 ${isDragging ? "ring-dashed opacity-50 ring-indigo-400" : ""} ${isOver && canDrop ? "scale-105 ring-indigo-500" : ""} hover:ring-gray-300 dark:hover:ring-slate-600`}
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

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-black/0 transition-colors duration-200 group-hover:bg-black/20" />

      {/* Delete Button - Always visible with good contrast */}
      <button
        onClick={e => {
          e.stopPropagation();
          onDelete(imageItem);
        }}
        className="absolute right-1.5 top-1.5 flex h-6 w-6 scale-90 transform cursor-pointer items-center justify-center rounded-full border-none bg-black/60 text-white opacity-0 shadow-lg transition-all duration-200 hover:bg-red-500 group-hover:scale-100 group-hover:opacity-100"
        title="删除图片"
      >
        <MdClose className="h-4 w-4" />
      </button>

      {/* Drag Indicator */}
      {isDragging && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/80">
            <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 9h4V6h3l-5-5-5 5h3v3zm-1 1H6V7l-5 5 5 5v-3h3v-4zm14 2l-5-5v3h-3v4h3v3l5-5zm-9 3h-4v3H7l5 5 5-5h-3v-3z" />
            </svg>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default ImageItem;
