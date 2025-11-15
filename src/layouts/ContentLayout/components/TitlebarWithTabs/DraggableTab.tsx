import { memo, useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import classnames from "classnames";
import { CloseOutlined } from "@ant-design/icons";
import { ITab } from "@/types/tab";

interface DraggableTabProps {
  tab: ITab;
  paneId: string;
  index: number;
  isActive: boolean;
  onClose: (e: React.MouseEvent) => void;
  onSwitch: () => void;
  onMove: (dragIndex: number, hoverIndex: number) => void;
  onDragEnd: (
    tab: ITab,
    paneId: string,
    dropZone?: "left" | "right" | "top" | "bottom",
  ) => void;
}

interface DragItem {
  type: string;
  tab: ITab;
  paneId: string;
  index: number;
}

const DraggableTab = memo((props: DraggableTabProps) => {
  const { tab, paneId, index, isActive, onClose, onSwitch, onMove, onDragEnd } =
    props;
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag] = useDrag({
    type: "TAB",
    item: (): DragItem => ({ type: "TAB", tab, paneId, index }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    end: (item, monitor) => {
      const didDrop = monitor.didDrop();
      const dropResult = monitor.getDropResult() as {
        paneId: string;
        dropZone?: "left" | "right" | "top" | "bottom";
      } | null;

      if (didDrop && dropResult) {
        onDragEnd(item.tab, item.paneId, dropResult.dropZone);
      }
    },
  });

  const [{ handlerId }, drop] = useDrop<
    DragItem,
    void,
    { handlerId: string | symbol | null }
  >({
    accept: "TAB",
    collect: (monitor) => ({
      handlerId: monitor.getHandlerId(),
    }),
    hover: (item: DragItem, monitor) => {
      if (!ref.current) {
        return;
      }

      // 同一个 pane 内才允许 hover 排序
      if (item.paneId !== paneId) {
        return;
      }

      const dragIndex = item.index;
      const hoverIndex = index;

      // 不替换自己
      if (dragIndex === hoverIndex) {
        return;
      }

      // 确定鼠标位置
      const hoverBoundingRect = ref.current.getBoundingClientRect();
      const hoverMiddleX =
        (hoverBoundingRect.right - hoverBoundingRect.left) / 2;
      const clientOffset = monitor.getClientOffset();
      const hoverClientX = clientOffset!.x - hoverBoundingRect.left;

      // 拖拽向右时,只在鼠标超过50%时才交换
      if (dragIndex < hoverIndex && hoverClientX < hoverMiddleX) {
        return;
      }

      // 拖拽向左时,只在鼠标超过50%时才交换
      if (dragIndex > hoverIndex && hoverClientX > hoverMiddleX) {
        return;
      }

      // 执行交换
      onMove(dragIndex, hoverIndex);

      // 更新索引以避免重复触发
      item.index = hoverIndex;
    },
  });

  drag(drop(ref));

  return (
    <div
      ref={ref}
      data-handler-id={handlerId}
      className={classnames(
        "flex items-center gap-2 px-3 h-8 rounded-md cursor-pointer select-none max-w-[200px] hover:bg-[var(--common-hover-bg)] group transition-all app-region-no-drag",
        {
          "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-200":
            isActive,
          "opacity-40": isDragging,
        },
      )}
      onClick={onSwitch}
    >
      <span className="flex-1 text-sm truncate text-[var(--text-color)]">
        {tab.title}
      </span>
      {tab.closable && (
        <button
          className="flex items-center justify-center w-3 h-3 border-none cursor-pointer text-sm rounded-full text-[var(--text-secondary-color)] text-xs transition-all hover:bg-[var(--common-hover-bg)]"
          onClick={onClose}
        >
          <CloseOutlined className="text-[10px]" />
        </button>
      )}
    </div>
  );
});

export default DraggableTab;
