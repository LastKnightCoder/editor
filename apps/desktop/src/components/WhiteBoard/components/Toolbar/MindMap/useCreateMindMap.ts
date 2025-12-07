import { useEffect } from "react";
import { useBoard, useCreateElementType } from "../../../hooks";
import {
  ECreateBoardElementType,
  MindNodeElement,
  Operation,
} from "../../../types";
import { BOARD_TO_CONTAINER } from "../../../constants";
import { useMemoizedFn } from "ahooks";
import { PointUtil, MindUtil } from "../../../utils";
import { v4 as uuid } from "uuid";
import useSettingStore from "@/stores/useSettingStore.ts";

const useCreateMindMap = () => {
  const board = useBoard();
  const createBoardElementType = useCreateElementType();

  const handleClick = useMemoizedFn((e: any) => {
    e.stopImmediatePropagation();
    if (createBoardElementType !== ECreateBoardElementType.MindMap) return;

    const currentPoint = PointUtil.screenToViewPort(
      board,
      e.clientX,
      e.clientY,
    );
    if (!currentPoint) return;

    const { x, y } = currentPoint;

    const fontSize = useSettingStore.getState().setting.fontSetting.fontSize;
    const lineHeight = fontSize * 1.57;
    const totalHeight = lineHeight + 16 * 2;

    const mindRoot: MindNodeElement = {
      id: uuid(),
      type: "mind-node",
      x,
      y,
      width: 24,
      height: totalHeight,
      actualHeight: totalHeight,
      level: 1,
      leftChildrenHeight: 0,
      rightChildrenHeight: 0,
      childrenHeight: 0,
      direction: "right",
      text: [
        {
          type: "paragraph",
          children: [
            {
              type: "formatted",
              text: "",
              bold: true,
            },
          ],
        },
      ],
      children: [],
      defaultFocus: true,
      isLeftFold: false,
      isRightFold: false,
      themeId: MindUtil.getDefaultThemeId(),
    };

    const ops: Operation[] = [];

    ops.push({
      type: "set_selection",
      properties: board.selection,
      newProperties: {
        selectArea: null,
        selectedElements: [],
      },
    });
    ops.push({
      type: "insert_node",
      path: [board.children.length],
      node: mindRoot,
    });

    board.apply(ops);

    board.currentCreateType = ECreateBoardElementType.None;
  });

  useEffect(() => {
    if (createBoardElementType !== ECreateBoardElementType.MindMap) return;
    const container = BOARD_TO_CONTAINER.get(board);
    if (!container) return;

    container.addEventListener("click", handleClick);

    return () => {
      container.removeEventListener("click", handleClick);
    };
  }, [board, createBoardElementType, handleClick]);
};

export default useCreateMindMap;
