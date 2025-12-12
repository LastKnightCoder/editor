import { useRef } from "react";
import { useDrag, useDrop, DropTargetMonitor } from "react-dnd";

import { ImageGalleryItem } from "../../../../../types";

const IMAGE_DRAG_TYPE = "image-gallery-setting-image-item";

interface DragItem extends ImageGalleryItem {
  index?: number;
  originalId: string;
  // 记录上次交换的目标元素 ID
  lastSwappedWithId?: string;
  // 记录上次交换的时间戳
  lastSwappedTime?: number;
}

interface IUseDragAndDropParams {
  onDrop: (
    dragImageItem: ImageGalleryItem,
    dropImageItem: ImageGalleryItem,
  ) => void;
  imageItem: ImageGalleryItem;
  index: number;
}

const useDragAndDrop = (params: IUseDragAndDropParams) => {
  const { onDrop, imageItem, index } = params;
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag] = useDrag({
    type: IMAGE_DRAG_TYPE,
    item: (): DragItem => ({
      ...imageItem,
      index,
      originalId: imageItem.id,
      lastSwappedWithId: undefined,
      lastSwappedTime: undefined,
    }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [{ isOver, canDrop }, drop] = useDrop<
    DragItem,
    void,
    {
      isOver: boolean;
      canDrop: boolean;
    }
  >({
    accept: IMAGE_DRAG_TYPE,
    canDrop: (item) => {
      return item.originalId !== imageItem.id;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
    // 实时拖拽：在 hover 时就触发交换
    hover: (item: DragItem, monitor: DropTargetMonitor) => {
      if (!ref.current) return;

      const dragIndex = item.index;
      const hoverIndex = index;

      // 不能与自己交换
      if (dragIndex === hoverIndex) return;
      if (item.originalId === imageItem.id) return;

      // 检查是否真正悬浮在目标上
      if (!monitor.isOver({ shallow: true })) return;

      // 防止动画过程中与刚交换的元素再次交换
      // 使用时间窗口（300ms）来区分"动画导致的意外hover"和"用户主动移动"
      // - 如果在 300ms 内再次 hover 到刚交换的元素，阻止交换（可能是动画导致的）
      // - 如果超过 300ms，允许交换（用户有意识地移回）
      // - 如果是不同的元素，直接允许交换
      const now = Date.now();
      const timeSinceLastSwap = item.lastSwappedTime ? now - item.lastSwappedTime : Infinity;
      const ANIMATION_PROTECTION_WINDOW = 300; // 动画保护时间窗口

      if (item.lastSwappedWithId === imageItem.id && timeSinceLastSwap < ANIMATION_PROTECTION_WINDOW) {
        return;
      }

      // 获取目标元素的边界
      const hoverBoundingRect = ref.current.getBoundingClientRect();

      // 获取目标元素的中心点
      const hoverMiddleX = (hoverBoundingRect.right - hoverBoundingRect.left) / 2;
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;

      // 获取鼠标位置
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;

      // 计算鼠标相对于目标元素的位置
      const hoverClientX = clientOffset.x - hoverBoundingRect.left;
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;

      // 只有当鼠标越过元素的一定比例时才触发交换
      // 这样可以避免在边缘时频繁触发
      const threshold = 0.3;

      // 判断是否应该触发交换
      const isInCenterX = hoverClientX > hoverMiddleX * (1 - threshold) &&
                          hoverClientX < hoverMiddleX * (1 + threshold);
      const isInCenterY = hoverClientY > hoverMiddleY * (1 - threshold) &&
                          hoverClientY < hoverMiddleY * (1 + threshold);

      // 当鼠标进入目标元素的中心区域时触发交换
      if (!isInCenterX && !isInCenterY) {
        // 向前拖动时，只有鼠标超过中心才触发
        if (dragIndex !== undefined && dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
          return;
        }
        // 向后拖动时，只有鼠标超过中心才触发
        if (dragIndex !== undefined && dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
          return;
        }
      }

      // 触发交换
      onDrop(
        { id: item.originalId, url: item.url, desc: item.desc },
        imageItem
      );

      // 更新拖拽项的索引
      item.index = hoverIndex;
      // 记录交换的目标元素和时间
      item.lastSwappedWithId = imageItem.id;
      item.lastSwappedTime = now;
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
