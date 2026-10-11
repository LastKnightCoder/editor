import type { WhiteboardToolProps } from "../../../extensions/api";
import { memo } from "react";
import { ArrowUpRight } from "lucide-react";
import { useActiveTool } from "../../../hooks";
import { ARROW_TOOL_ID } from "../../../constants/tools";
import { ChromeButton } from "../../../chrome";

const Arrow = memo(({ run }: WhiteboardToolProps) => {
  const active = useActiveTool() === ARROW_TOOL_ID;

  return (
    <ChromeButton
      label="箭头"
      active={active}
      onClick={() => {
        run();
      }}
    >
      <ArrowUpRight strokeWidth={1.75} />
    </ChromeButton>
  );
});

export default Arrow;
