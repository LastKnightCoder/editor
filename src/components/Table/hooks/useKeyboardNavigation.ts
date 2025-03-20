import { useEffect, RefObject } from "react";
import { useMemoizedFn } from "ahooks";
import { Direction } from "../TableStore";

// 字符串方向类型
type DirectionString = "up" | "down" | "left" | "right";

/**
 * 键盘导航钩子
 * 用于处理键盘导航事件
 * @param ref 表格容器的引用
 * @param onMove 移动回调
 * @param onEdit 开始编辑回调
 */
export const useKeyboardNavigation = (
  ref: RefObject<HTMLElement>,
  onMove: (direction: DirectionString | Direction) => void,
  onEdit: () => void,
) => {
  // 使用useMemoizedFn优化性能
  const handleKeyDown = useMemoizedFn((e: KeyboardEvent) => {
    // 忽略输入控件内的键盘事件
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    ) {
      return;
    }

    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        onMove("up");
        break;
      case "ArrowDown":
        e.preventDefault();
        onMove("down");
        break;
      case "ArrowLeft":
        e.preventDefault();
        onMove("left");
        break;
      case "ArrowRight":
        e.preventDefault();
        onMove("right");
        break;
      case "Enter":
        e.preventDefault();
        onEdit();
        break;
    }
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.addEventListener("keydown", handleKeyDown);

    return () => {
      el.removeEventListener("keydown", handleKeyDown);
    };
  }, [ref, handleKeyDown]);
};

export default useKeyboardNavigation;
