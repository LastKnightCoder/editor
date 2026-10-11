import type { WhiteboardToolProps } from "../../../extensions/api";
import { Network } from "lucide-react";

import { useActiveTool } from "../../../hooks";
import { MIND_TOOL_ID } from "../../../constants/tools";
import { ChromeButton } from "../../../chrome";

const MindMap = ({ run }: WhiteboardToolProps) => {
  const active = useActiveTool() === MIND_TOOL_ID;

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
