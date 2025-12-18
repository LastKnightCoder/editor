import { memo } from "react";
import classnames from "classnames";
import { useMemoizedFn } from "ahooks";
import { Columns3 } from "lucide-react";
import { Tooltip } from "antd";

import { ECreateBoardElementType } from "../../../types";
import { useBoard, useCreateElementType } from "../../../hooks";
import useCreateColumn from "./useCreateColumn";

import styles from "../index.module.less";

interface ColumnProps {
  className?: string;
}

const Column = memo(({ className }: ColumnProps) => {
  const board = useBoard();
  const createBoardElementType = useCreateElementType();

  useCreateColumn();

  const onClickCreateColumn = useMemoizedFn(() => {
    board.currentCreateType =
      createBoardElementType === ECreateBoardElementType.Column
        ? ECreateBoardElementType.None
        : ECreateBoardElementType.Column;
  });

  return (
    <Tooltip title="Column">
      <div
        className={classnames(className, styles.toolBarItem, {
          [styles.active]:
            createBoardElementType === ECreateBoardElementType.Column,
        })}
        onClick={onClickCreateColumn}
      >
        <Columns3 size={18} style={{ transform: "rotate(90deg)" }} />
      </div>
    </Tooltip>
  );
});

Column.displayName = "Column";

export default Column;
