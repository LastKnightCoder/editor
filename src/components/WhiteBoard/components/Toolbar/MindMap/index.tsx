import React from "react";
import { RiMindMap } from "react-icons/ri";
import { useMemoizedFn } from "ahooks";
import { Tooltip } from "antd";

import useCreateMindMap from "./useCreateMindMap.ts";
import { useBoard, useCreateElementType } from "../../../hooks";
import { ECreateBoardElementType } from "../../../types";

interface MindMapProps {
  className?: string;
  style?: React.CSSProperties;
}

const MindMap = (props: MindMapProps) => {
  const { className, style } = props;

  const board = useBoard();

  useCreateMindMap();

  const createElementType = useCreateElementType();

  const onClickCreateElement = useMemoizedFn(() => {
    board.currentCreateType =
      ECreateBoardElementType.MindMap === createElementType
        ? ECreateBoardElementType.None
        : ECreateBoardElementType.MindMap;
  });

  return (
    <Tooltip title="思维导图">
      <div className={className} style={style} onClick={onClickCreateElement}>
        <RiMindMap />
      </div>
    </Tooltip>
  );
};

export default MindMap;
