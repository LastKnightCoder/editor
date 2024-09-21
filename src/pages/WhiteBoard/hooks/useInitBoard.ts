import Board, { BoardElement } from "@/pages/WhiteBoard/Board.ts";
import { useMemoizedFn } from "ahooks";
import { useEffect } from "react";
import useWhiteBoardStore from "@/pages/WhiteBoard/useWhiteBoardStore.ts";

export const useInitBoard = (board: Board, container: HTMLDivElement | null) => {
  const eventHandlerGenerator = useMemoizedFn((eventName: string) => {
    return (event: any) => {
      // @ts-expect-error
      board.hooks[eventName].call(event);
    }
  });

  useEffect(() => {
    if (!container) return;

    const handleMouseDown = eventHandlerGenerator('onMouseDown');
    const handleMouseMove = eventHandlerGenerator('onMouseMove');
    const handleMouseUp = eventHandlerGenerator('onMouseUp');
    const handleMouseEnter = eventHandlerGenerator('onMouseEnter');
    const handleMouseLeave = eventHandlerGenerator('onMouseLeave');
    const handleContextMenu = eventHandlerGenerator('onContextMenu');
    const handleClick = eventHandlerGenerator('onClick');
    const handleDblClick = eventHandlerGenerator('onDblClick');
    const handleKeyDown = eventHandlerGenerator('onKeyDown');
    const handleKeyUp = eventHandlerGenerator('onKeyUp');
    const handleGlobalMouseDown = eventHandlerGenerator('onGlobalMouseDown');
    const handleGlobalMouseUp = eventHandlerGenerator('onGlobalMouseUp');

    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('mouseenter', handleMouseEnter);
    container.addEventListener('mouseleave', handleMouseLeave);
    container.addEventListener('contextmenu', handleContextMenu);
    container.addEventListener('click', handleClick);
    container.addEventListener('dblclick', handleDblClick);

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('mousedown', handleGlobalMouseDown);
    document.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      document.removeEventListener('mousedown', handleGlobalMouseDown);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      if (container) {
        container.removeEventListener('mousedown', handleMouseDown);
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('mouseup', handleGlobalMouseUp);
        container.removeEventListener('mouseenter', handleMouseEnter);
        container.removeEventListener('mouseleave', handleMouseLeave);
        container.removeEventListener('contextmenu', handleContextMenu);
        container.removeEventListener('click', handleClick);
        container.removeEventListener('dblclick', handleDblClick);
      }
      board.destroy();
    }
  }, [eventHandlerGenerator, container, board]);

  useEffect(() => {
    useWhiteBoardStore.setState({
      value: board.value,
    });

    const handleValueChange = (value: BoardElement[]) => {
      useWhiteBoardStore.setState({
        value
      });
    }
    board.on('onChange', handleValueChange);

    return () => {
      board.off('onChange', handleValueChange);
    }
  }, [board]);
}

export default useInitBoard;