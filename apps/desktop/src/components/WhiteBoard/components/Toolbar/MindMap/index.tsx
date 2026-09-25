import { Network } from "lucide-react";

import { useBoard, useCreateElementType } from "../../../hooks";
import { ECreateBoardElementType } from "../../../types";
import { ChromeButton } from "../../../chrome";

const MindMap = () => {
  const board = useBoard();
  const createType = useCreateElementType();
  const active = createType === ECreateBoardElementType.MindMap;

  return (
    <ChromeButton
      label="思维导图"
      active={active}
      onClick={() => {
        board.currentCreateType = active
          ? ECreateBoardElementType.None
          : ECreateBoardElementType.MindMap;
      }}
    >
      <Network strokeWidth={1.75} />
    </ChromeButton>
  );
};

export default MindMap;
