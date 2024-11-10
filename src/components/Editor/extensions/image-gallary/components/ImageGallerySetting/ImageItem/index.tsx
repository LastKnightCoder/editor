import { motion } from "framer-motion";
import { DeleteOutlined } from '@ant-design/icons';

import classnames from "classnames";

import LocalImage from "@/components/LocalImage";
import { ImageGalleryItem } from "@editor/types";

import useDragAndDrop from "./useDragAndDrop";
import styles from './index.module.less';

interface IImageItemProps {
  imageItem: ImageGalleryItem;
  onDelete: (item: ImageGalleryItem) => void;
  onDrop: (dragImageItem: ImageGalleryItem, dropImageItem: ImageGalleryItem) => void;
}

const ImageItem = (props: IImageItemProps) => {
  const { imageItem, onDelete, onDrop } = props;

  const {
    ref,
    isDragging,
    isOver,
    canDrop,
  } = useDragAndDrop({
    imageItem,
    onDrop
  });

  return (
    <motion.div
      ref={ref}
      layoutId={imageItem.id}
      className={classnames(styles.container, {
        [styles.drop]: isOver && canDrop,
        [styles.dragging]: isDragging,
      })}
    >
      <LocalImage url={imageItem.url} alt={imageItem.desc || ''} className={styles.img} />
      <div className={styles.delete} onClick={() => { onDelete(imageItem) }}>
        <DeleteOutlined />
      </div>
    </motion.div>
  )
}

export default ImageItem;
