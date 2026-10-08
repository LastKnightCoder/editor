import { memo } from "react";
import { Columns3 } from "lucide-react";

import { ECreateBoardElementType } from "../../../types";
import { useBoard, useCreateElementType } from "../../../hooks";
import { ChromeButton } from "../../../chrome";
import useCreateColumn from "./useCreateColumn";

const Column = memo(() => {
  const board = useBoard();
  const createType = useCreateElementType();
  const active = createType === ECreateBoardElementType.Column;

  useCreateColumn();

  return (
    <ChromeButton
      label="分栏"
      active={active}
      onClick={() => {
        board.currentCreateType = active
          ? ECreateBoardElementType.None
          : ECreateBoardElementType.Column;
      }}
    >
      <Columns3 strokeWidth={1.75} className="rotate-90" />
    </ChromeButton>
  );
});

Column.displayName = "Column";

export default Column;
