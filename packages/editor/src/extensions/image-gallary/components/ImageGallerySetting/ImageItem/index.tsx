import { motion } from "motion/react";
import { MdClose } from "react-icons/md";
import { ImageGalleryItem } from "../../../../../types";
import useDragAndDrop from "./useDragAndDrop";
import { useSlateStatic } from "slate-react";

interface IImageItemProps {
  imageItem: ImageGalleryItem;
  index: number;
  onDelete: (item: ImageGalleryItem) => void;
  onDrop: (
    dragImageItem: ImageGalleryItem,
    dropImageItem: ImageGalleryItem,
  ) => void;
}

const ImageItem = (props: IImageItemProps) => {
  const { imageItem, index, onDelete, onDrop } = props;

  const { ref, isDragging, isOver, canDrop } = useDragAndDrop({
    imageItem,
    index,
    onDrop,
  });

  const editor = useSlateStatic();
  const Image = editor.services?.components?.Image;

  return (
    <motion.div
      ref={ref}
      layout
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={`
        relative group aspect-square rounded-xl overflow-hidden cursor-move
        bg-gray-100 dark:bg-zinc-800
        ring-2 ring-transparent
        transition-colors duration-200
        ${isDragging ? "opacity-50 ring-indigo-400 ring-dashed" : ""}
        ${isOver && canDrop ? "ring-indigo-500 scale-105" : ""}
        hover:ring-gray-300 dark:hover:ring-slate-600
      `}
    >
      {/* Image */}
      {Image ? (
        <Image
          url={imageItem.url}
          alt={imageItem.desc || ""}
          className="w-full h-full object-cover"
        />
      ) : (
        <img
          src={imageItem.url}
          alt={imageItem.desc || ""}
          className="w-full h-full object-cover"
        />
      )}

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200" />

      {/* Delete Button - Always visible with good contrast */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(imageItem);
        }}
        className="
          absolute top-1.5 right-1.5
          w-6 h-6 rounded-full
          flex items-center justify-center
          bg-black/60 hover:bg-red-500
          text-white
          opacity-0 group-hover:opacity-100
          transition-all duration-200
          transform scale-90 group-hover:scale-100
          shadow-lg
          cursor-pointer
          border-none
        "
        title="删除图片"
      >
        <MdClose className="w-4 h-4" />
      </button>

      {/* Drag Indicator */}
      {isDragging && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-indigo-500/80 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-white"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M10 9h4V6h3l-5-5-5 5h3v3zm-1 1H6V7l-5 5 5 5v-3h3v-4zm14 2l-5-5v3h-3v4h3v3l5-5zm-9 3h-4v3H7l5 5 5-5h-3v-3z" />
            </svg>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default ImageItem;
