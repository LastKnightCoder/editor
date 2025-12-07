import { motion } from "framer-motion";
import { DeleteOutlined } from "@ant-design/icons";
import classnames from "classnames";
import { ImageGalleryItem } from "../../../../../types";
import useDragAndDrop from "./useDragAndDrop";
import styles from "./index.module.less";
import { useSlateStatic } from "slate-react";

interface IImageItemProps {
  imageItem: ImageGalleryItem;
  onDelete: (item: ImageGalleryItem) => void;
  onDrop: (
    dragImageItem: ImageGalleryItem,
    dropImageItem: ImageGalleryItem,
  ) => void;
}

const ImageItem = (props: IImageItemProps) => {
  const { imageItem, onDelete, onDrop } = props;

  const { ref, isDragging, isOver, canDrop } = useDragAndDrop({
    imageItem,
    onDrop,
  });

  const editor = useSlateStatic();
  const Image = editor.services?.components?.Image;

  return (
    <motion.div
      ref={ref}
      layoutId={imageItem.id}
      className={classnames(styles.container, {
        [styles.drop]: isOver && canDrop,
        [styles.dragging]: isDragging,
      })}
    >
      {Image ? (
        <Image
          url={imageItem.url}
          alt={imageItem.desc || ""}
          className={styles.img}
        />
      ) : (
        <img
          src={imageItem.url}
          alt={imageItem.desc || ""}
          className={styles.img}
        />
      )}
      <div
        className={styles.delete}
        onClick={() => {
          onDelete(imageItem);
        }}
      >
        <DeleteOutlined />
      </div>
    </motion.div>
  );
};

export default ImageItem;
