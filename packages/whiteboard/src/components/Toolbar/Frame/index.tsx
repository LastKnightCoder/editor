import { useWhiteboardI18n } from "../../../i18n";
import type { WhiteboardToolProps } from "../../../extensions/api";
import { memo } from "react";
import { Frame as FrameIcon } from "lucide-react";
import { useActiveTool } from "../../../hooks";
import { ChromeButton } from "../../../chrome";
import { FRAME_TOOL_ID } from "../../../constants/tools";

const Frame = memo(({ run }: WhiteboardToolProps) => {
  const { t } = useWhiteboardI18n();
  const active = useActiveTool() === FRAME_TOOL_ID;

  return (
    <ChromeButton
      label={t("toolbar.frame")}
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
