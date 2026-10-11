import type { WhiteboardToolProps } from "../../../extensions/api";
import { memo } from "react";
import { PenLine } from "lucide-react";
import { useActiveTool } from "../../../hooks";
import { HANDWRITE_TOOL_ID } from "../../../constants/tools";
import { ChromeButton } from "../../../chrome";

const Handwrite = memo(({ run }: WhiteboardToolProps) => {
  const active = useActiveTool() === HANDWRITE_TOOL_ID;

  return (
    <ChromeButton
      label="手写"
      active={active}
      onClick={() => {
        run();
      }}
    >
      <PenLine strokeWidth={1.75} />
    </ChromeButton>
  );
});

export default Handwrite;
