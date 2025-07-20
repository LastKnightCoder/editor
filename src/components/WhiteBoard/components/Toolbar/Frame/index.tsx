import { memo } from "react";
import classnames from "classnames";
import SVG from "react-inlinesvg";
import { useMemoizedFn } from "ahooks";
import { ECreateBoardElementType } from "../../../types";
import { useBoard, useCreateElementType } from "../../../hooks";
import frameIcon from "@/assets/white-board/frame.svg";
import useCreateFrame from "./useCreateFrame";

import styles from "../index.module.less";
import { Tooltip } from "antd";

interface FrameProps {
  className?: string;
}

const Frame = memo(({ className }: FrameProps) => {
  const board = useBoard();
  const createBoardElementType = useCreateElementType();

  useCreateFrame();

  const onClickCreateFrame = useMemoizedFn(() => {
    board.currentCreateType =
      createBoardElementType === ECreateBoardElementType.Frame
        ? ECreateBoardElementType.None
        : ECreateBoardElementType.Frame;
  });

  return (
    <Tooltip title="Frame">
      <div
        className={classnames(className, styles.toolBarItem, {
          [styles.active]:
            createBoardElementType === ECreateBoardElementType.Frame,
        })}
        onClick={onClickCreateFrame}
      >
        <SVG src={frameIcon} />
      </div>
    </Tooltip>
  );
});

Frame.displayName = "Frame";

export default Frame;
