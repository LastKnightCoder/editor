import { memo } from "react";
import { PenLine } from "lucide-react";
import { Tooltip } from "antd";
import { useMemoizedFn } from "ahooks";
import { ECreateBoardElementType } from "../../../types";
import { useBoard, useCreateElementType } from "../../../hooks";
import useCreateHandwrite from "./useCreateHandwrite";

interface HandwriteProps {
  className?: string;
  style?: React.CSSProperties;
}

const Handwrite = memo((props: HandwriteProps) => {
  const { className, style } = props;

  const board = useBoard();
  const createBoardElementType = useCreateElementType();

  useCreateHandwrite();

  const onClickCreateElement = useMemoizedFn(() => {
    board.currentCreateType =
      createBoardElementType === ECreateBoardElementType.Handwrite
        ? ECreateBoardElementType.None
        : ECreateBoardElementType.Handwrite;
  });

  return (
    <Tooltip title="手写">
      <div className={className} style={style} onClick={onClickCreateElement}>
        <PenLine size={18} />
      </div>
    </Tooltip>
  );
});

export default Handwrite;
