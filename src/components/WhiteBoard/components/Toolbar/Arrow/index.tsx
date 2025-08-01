import React, { memo } from "react";
import SVG from "react-inlinesvg";
import straightArrowIcon from "@/assets/white-board/straight-arrow.svg";
import { useMemoizedFn } from "ahooks";
import useCreateArrow from "./useCreateArrow";
import { useCreateElementType, useBoard } from "../../../hooks";
import { ECreateBoardElementType } from "../../../types";
import { Tooltip } from "antd";

interface ArrowProps {
  className?: string;
  style?: React.CSSProperties;
}

const Arrow = memo((props: ArrowProps) => {
  const { className, style } = props;

  const board = useBoard();
  const createBoardElementType = useCreateElementType();

  useCreateArrow();

  const onClickCreateElement = useMemoizedFn(() => {
    const createType =
      ECreateBoardElementType.StraightArrow === createBoardElementType
        ? ECreateBoardElementType.None
        : ECreateBoardElementType.StraightArrow;
    board.currentCreateType = createType;
  });

  return (
    <Tooltip title="箭头">
      <div className={className} style={style} onClick={onClickCreateElement}>
        <SVG src={straightArrowIcon} />
      </div>
    </Tooltip>
  );
});

export default Arrow;
