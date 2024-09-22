import Board, { BoardElement, IBoardPlugin, ViewPort } from "@/pages/WhiteBoard/Board.ts";
import { useMemoizedFn } from "ahooks";
import { useEffect } from "react";
import useWhiteBoardStore from "@/pages/WhiteBoard/useWhiteBoardStore.ts";
import { BOARD_TO_CONTAINER } from '../constants/map.ts';

type Events = 'onMouseDown' | 'onMouseMove' | 'onMouseUp' | 'onMouseEnter' | 'onMouseLeave' | 'onContextMenu' | 'onClick' | 'onDblClick' | 'onGlobalMouseDown' | 'onGlobalMouseUp' | 'onKeyDown' | 'onKeyUp' | 'onWheel';

export const useInitBoard = (board: Board, container: HTMLDivElement | null, plugins: IBoardPlugin[]) => {
  const eventHandlerGenerator = useMemoizedFn((eventName: Events) => {
    return (event: any) => {
      board[eventName](event);
    }
  });

  useEffect(() => {
    if (!container) return;

    BOARD_TO_CONTAINER.set(board, container);

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
    const handleOnWheel = eventHandlerGenerator('onWheel');

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
    document.addEventListener('wheel', handleOnWheel);

    return () => {
      document.removeEventListener('mousedown', handleGlobalMouseDown);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('wheel', handleOnWheel);
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
      viewPort: board.viewPort,
    });

    const handleValueChange = (value: BoardElement[]) => {
      useWhiteBoardStore.setState({
        value
      });
    }
    const handleViewPortChange = (viewPort: ViewPort) => {
      useWhiteBoardStore.setState({
        viewPort
      });
    }

    board.on('onChange', handleValueChange);
    board.on('onViewPortChange', handleViewPortChange);

    return () => {
      board.off('onChange', handleValueChange);
      board.off('onViewPortChange', handleViewPortChange);
    }
  }, [board]);

  useEffect(() => {
    board.initPlugins(plugins);
  }, [board, plugins]);
}

export default useInitBoard;