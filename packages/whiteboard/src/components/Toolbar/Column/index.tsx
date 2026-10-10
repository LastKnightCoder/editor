import type { WhiteboardToolProps } from "../../../extensions/api";
import { memo } from "react";
import { Columns3 } from "lucide-react";

import { ECreateBoardElementType } from "../../../types";
import { useCreateElementType } from "../../../hooks";
import { ChromeButton } from "../../../chrome";
import useCreateColumn from "./useCreateColumn";

const Column = memo(({ run }: WhiteboardToolProps) => {
  const createType = useCreateElementType();
  const active = createType === ECreateBoardElementType.Column;

  useCreateColumn();

  return (
    <ChromeButton
      label="分栏"
      active={active}
      onClick={() => {
        run();
      }}
    >
      <Columns3 strokeWidth={1.75} className="rotate-90" />
    </ChromeButton>
  );
});

Column.displayName = "Column";

export default Column;
