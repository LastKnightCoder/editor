import { useRef } from "react";
import { useDrag, useDrop } from "react-dnd";

import { ImageGalleryItem } from "@/components/Editor/types";

const IMAGE_DRAG_TYPE = "image-gallery-setting-image-item";

interface IUseDragAndDropParams {
  onDrop: (
    dragImageItem: ImageGalleryItem,
    dropImageItem: ImageGalleryItem,
  ) => void;
  imageItem: ImageGalleryItem;
}

const useDragAndDrop = (params: IUseDragAndDropParams) => {
  const { onDrop, imageItem } = params;
  const ref = useRef(null);

  const [{ isDragging }, drag] = useDrag({
    type: IMAGE_DRAG_TYPE,
    item: imageItem,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [{ isOver, canDrop }, drop] = useDrop<
    ImageGalleryItem,
    void,
    {
      isOver: boolean;
      canDrop: boolean;
    }
  >({
    accept: IMAGE_DRAG_TYPE,
    canDrop: (item) => {
      return item.id !== imageItem.id;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
    drop: (item) => {
      if (item.id === imageItem.id) {
        return;
      }
      onDrop(item, imageItem);
    },
  });

  drag(drop(ref));

  return {
    ref,
    isDragging,
    isOver,
    canDrop,
  };
};

export default useDragAndDrop;
