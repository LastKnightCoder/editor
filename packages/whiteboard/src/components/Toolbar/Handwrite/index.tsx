import { memo } from "react";
import { PenLine } from "lucide-react";
import { ECreateBoardElementType } from "../../../types";
import { useBoard, useCreateElementType } from "../../../hooks";
import { ChromeButton } from "../../../chrome";
import useCreateHandwrite from "./useCreateHandwrite";

const Handwrite = memo(() => {
  const board = useBoard();
  const createType = useCreateElementType();
  const active = createType === ECreateBoardElementType.Handwrite;

  useCreateHandwrite();

  return (
    <ChromeButton
      label="手写"
      active={active}
      onClick={() => {
        board.currentCreateType = active
          ? ECreateBoardElementType.None
          : ECreateBoardElementType.Handwrite;
      }}
    >
      <PenLine strokeWidth={1.75} />
    </ChromeButton>
  );
});

export default Handwrite;
