import { useMemoizedFn } from "ahooks";
import Board from "../Board";
import { Events } from "../types";

/**
 * 生成事件处理函数的 hook
 */
const useEventHandlers = (board: Board) => {
  // 生成各种事件处理函数
  const eventHandlerGenerator = useMemoizedFn((eventName: Events) => {
    return (event: any) => {
      board[eventName](event);
    };
  });

  // 鼠标事件
  const handleMouseDown = eventHandlerGenerator("onMouseDown");
  const handleMouseMove = eventHandlerGenerator("onMouseMove");
  const handleMouseUp = eventHandlerGenerator("onMouseUp");
  const handleMouseEnter = eventHandlerGenerator("onMouseEnter");
  const handleMouseLeave = eventHandlerGenerator("onMouseLeave");
  const handleContextMenu = eventHandlerGenerator("onContextMenu");
  const handleClick = eventHandlerGenerator("onClick");
  const handleDblClick = eventHandlerGenerator("onDblClick");

  // 指针事件
  const handleOnPointerDown = eventHandlerGenerator("onPointerDown");
  const handleOnPointerMove = eventHandlerGenerator("onPointerMove");
  const handleOnPointerUp = eventHandlerGenerator("onPointerUp");

  // 全局事件 - 键盘事件需要特殊处理
  const handleKeyDown = useMemoizedFn((event: KeyboardEvent) => {
    // 如果有元素正在编辑，不处理方向键（避免干扰文本编辑器内的光标移动）
    if (board.isEditingElements.length > 0) {
      // 对于方向键，直接返回，让编辑器处理
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
      ) {
        return;
      }
    }

    // 检查事件目标，如果在编辑器内部，不处理方向键
    const target = event.target as HTMLElement;
    if (
      target &&
      (target.getAttribute("contenteditable") === "true" ||
        target.closest('[contenteditable="true"]') ||
        target.closest("[data-slate-editor]") ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA")
    ) {
      // 对于方向键，直接返回，让编辑器处理
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
      ) {
        return;
      }
    }

    board.onKeyDown(event);
  });

  const handleKeyUp = useMemoizedFn((event: KeyboardEvent) => {
    // 如果有元素正在编辑，不处理方向键（避免干扰文本编辑器内的光标移动）
    if (board.isEditingElements.length > 0) {
      // 对于方向键，直接返回，让编辑器处理
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
      ) {
        return;
      }
    }

    // 检查事件目标，如果在编辑器内部，不处理方向键
    const target = event.target as HTMLElement;
    if (
      target &&
      (target.getAttribute("contenteditable") === "true" ||
        target.closest('[contenteditable="true"]') ||
        target.closest("[data-slate-editor]") ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA")
    ) {
      // 对于方向键，直接返回，让编辑器处理
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
      ) {
        return;
      }
    }

    board.onKeyUp(event);
  });
  const handleGlobalMouseDown = eventHandlerGenerator("onGlobalMouseDown");
  const handleGlobalMouseUp = eventHandlerGenerator("onGlobalMouseUp");
  const handleOnWheel = eventHandlerGenerator("onWheel");
  const handleOnGlobalPointerDown = eventHandlerGenerator(
    "onGlobalPointerDown",
  );
  const handleOnGlobalPointerMove = eventHandlerGenerator(
    "onGlobalPointerMove",
  );
  const handleOnGlobalPointerUp = eventHandlerGenerator("onGlobalPointerUp");
  const handleOnPaste = eventHandlerGenerator("onPaste");
  const handleOnCopy = eventHandlerGenerator("onCopy");
  const handleOnCut = eventHandlerGenerator("onCut");
  const handleOnDrop = eventHandlerGenerator("onDrop");
  const handleOnDragOver = eventHandlerGenerator("onDragOver");
  const handleOnDragEnter = eventHandlerGenerator("onDragEnter");
  const handleOnDragLeave = eventHandlerGenerator("onDragLeave");

  return {
    // 本地事件
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseEnter,
    handleMouseLeave,
    handleContextMenu,
    handleClick,
    handleDblClick,
    handleOnPointerDown,
    handleOnPointerMove,
    handleOnPointerUp,

    // 全局事件
    handleKeyDown,
    handleKeyUp,
    handleGlobalMouseDown,
    handleGlobalMouseUp,
    handleOnWheel,
    handleOnGlobalPointerDown,
    handleOnGlobalPointerMove,
    handleOnGlobalPointerUp,
    handleOnPaste,
    handleOnCopy,
    handleOnCut,
    handleOnDrop,
    handleOnDragOver,
    handleOnDragEnter,
    handleOnDragLeave,

    // 生成器
    eventHandlerGenerator,
  };
};

export default useEventHandlers;
