import { useEffect } from "react";
import { useBoard, useCreateElementType } from "../../../hooks";
import { ECreateBoardElementType, MindNodeElement } from "../../../types";
import { BOARD_TO_CONTAINER, MIND_COLORS } from "../../../constants";
import { useMemoizedFn } from "ahooks";
import { PointUtil } from "../../../utils";
import { v4 as uuid } from 'uuid';

const useCreateMindMap = () => {
  const board = useBoard();
  const createBoardElementType = useCreateElementType();

  const handleClick = useMemoizedFn((e: any) => {
    e.stopImmediatePropagation();
    if (createBoardElementType !== ECreateBoardElementType.MindMap) return;

    const currentPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!currentPoint) return;

    const { x, y } = currentPoint;

    const mindRoot: MindNodeElement = {
      id: uuid(),
      type: 'mind-node',
      x,
      y,
      width: 24,
      height: 48,
      actualHeight: 48,
      level: 1,
      childrenHeight: 0,
      direction: 'right',
      text: [{
        type: 'paragraph',
        children: [{
          type: 'formatted',
          text: '',
          bold: true,
        }],
      }],
      ...MIND_COLORS[0],
      border: 'transparent',
      children: [],
      defaultFocus: true,
    }

    board.apply({
      type: 'insert_node',
      path: [board.children.length],
      node: mindRoot,
    });

    board.currentCreateType = ECreateBoardElementType.None;
  })

  useEffect(() => {
    if (createBoardElementType !== ECreateBoardElementType.MindMap) return;
    const container = BOARD_TO_CONTAINER.get(board);
    if (!container) return;

    container.addEventListener('click', handleClick);

    return () => {
      container.removeEventListener('click', handleClick);
    }

  }, [board, createBoardElementType, handleClick]);
}

export default useCreateMindMap;
