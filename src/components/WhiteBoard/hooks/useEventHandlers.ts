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

  // 全局事件
  const handleKeyDown = eventHandlerGenerator("onKeyDown");
  const handleKeyUp = eventHandlerGenerator("onKeyUp");
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

    // 生成器
    eventHandlerGenerator,
  };
};

export default useEventHandlers;
