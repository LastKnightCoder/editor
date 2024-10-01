import{ Board, BoardElement, IBoardPlugin, ViewPort, Events, Selection } from "../types";
import { useMemoizedFn } from "ahooks";
import { useEffect } from "react";
import useWhiteBoardStore from "../useWhiteBoardStore.ts";
import { BOARD_TO_CONTAINER } from '../constants';


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
    const handleOnPointerDown = eventHandlerGenerator('onPointerDown');
    const handleOnPointerMove = eventHandlerGenerator('onPointerMove');
    const handleOnPointerUp = eventHandlerGenerator('onPointerUp');
    const handleOnGlobalPointerDown = eventHandlerGenerator('onGlobalPointerDown');
    const handleOnGlobalPointerMove = eventHandlerGenerator('onGlobalPointerMove');
    const handleOnGlobalPointerUp = eventHandlerGenerator('onGlobalPointerUp');

    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('mouseenter', handleMouseEnter);
    container.addEventListener('mouseleave', handleMouseLeave);

    container.addEventListener('contextmenu', handleContextMenu);
    container.addEventListener('click', handleClick);
    container.addEventListener('dblclick', handleDblClick);

    container.addEventListener('pointerdown', handleOnPointerDown);
    container.addEventListener('pointermove', handleOnPointerMove);
    container.addEventListener('pointerup', handleOnPointerUp);

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    document.addEventListener('mousedown', handleGlobalMouseDown);
    document.addEventListener('mouseup', handleGlobalMouseUp);
    document.addEventListener('wheel', handleOnWheel);

    document.addEventListener('pointerdown', handleOnGlobalPointerDown);
    document.addEventListener('pointermove', handleOnGlobalPointerMove);
    document.addEventListener('pointerup', handleOnGlobalPointerUp);


    return () => {
      document.removeEventListener('mousedown', handleGlobalMouseDown);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('wheel', handleOnWheel);
      document.removeEventListener('pointerdown', handleOnGlobalPointerDown);
      document.removeEventListener('pointermove', handleOnGlobalPointerMove);
      document.removeEventListener('pointerup', handleOnGlobalPointerUp);
      if (container) {
        container.removeEventListener('mousedown', handleMouseDown);
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('mouseup', handleGlobalMouseUp);
        container.removeEventListener('mouseenter', handleMouseEnter);
        container.removeEventListener('mouseleave', handleMouseLeave);
        container.removeEventListener('contextmenu', handleContextMenu);
        container.removeEventListener('click', handleClick);
        container.removeEventListener('dblclick', handleDblClick);
        container.removeEventListener('pointerdown', handleOnPointerDown);
        container.removeEventListener('pointermove', handleOnPointerMove);
        container.removeEventListener('pointerup', handleOnPointerUp);
      }
      board.destroy();
    }
  }, [eventHandlerGenerator, container, board]);

  useEffect(() => {
    useWhiteBoardStore.setState({
      children: board.children,
      viewPort: board.viewPort,
      selection: board.selection
    });

    const handleValueChange = (children: BoardElement[]) => {
      localStorage.setItem('whiteBoardData', JSON.stringify(children));
      useWhiteBoardStore.setState({
        children
      });
    }
    const handleViewPortChange = (viewPort: ViewPort) => {
      useWhiteBoardStore.setState({
        viewPort
      });
    }

    const handleSelectionChange = (selection: Selection) => {
      useWhiteBoardStore.setState({
        selection
      });
    }

    board.on('onValueChange', handleValueChange);
    board.on('onViewPortChange', handleViewPortChange);
    board.on('onSelectionChange', handleSelectionChange);

    return () => {
      board.off('onValueChange', handleValueChange);
      board.off('onViewPortChange', handleViewPortChange);
      board.off('onSelectionChange', handleSelectionChange);
    }
  }, [board]);

  useEffect(() => {
    board.initPlugins(plugins);
  }, [board, plugins]);
}

export default useInitBoard;