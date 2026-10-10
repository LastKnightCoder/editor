import type { WhiteboardToolProps } from "../../../extensions/api";
import { Network } from "lucide-react";

import { useCreateElementType } from "../../../hooks";
import { ECreateBoardElementType } from "../../../types";
import { ChromeButton } from "../../../chrome";

const MindMap = ({ run }: WhiteboardToolProps) => {
  const createType = useCreateElementType();
  const active = createType === ECreateBoardElementType.MindMap;

  return (
    <ChromeButton
      label="思维导图"
      active={active}
      onClick={() => {
        run();
      }}
    >
      <Network strokeWidth={1.75} />
    </ChromeButton>
  );
};

export default MindMap;
