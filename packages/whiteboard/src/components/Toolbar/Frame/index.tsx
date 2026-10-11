import type { WhiteboardToolProps } from "../../../extensions/api";
import { memo } from "react";
import { Frame as FrameIcon } from "lucide-react";
import { useActiveTool } from "../../../hooks";
import { ChromeButton } from "../../../chrome";
import { FRAME_TOOL_ID } from "../../../constants/tools";

const Frame = memo(({ run }: WhiteboardToolProps) => {
  const active = useActiveTool() === FRAME_TOOL_ID;

  return (
    <ChromeButton
      label="画框"
      active={active}
      onClick={() => {
        run();
      }}
    >
      <FrameIcon strokeWidth={1.75} />
    </ChromeButton>
  );
});

Frame.displayName = "Frame";

export default Frame;
