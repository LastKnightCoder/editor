import { useWhiteboardI18n } from "../../../i18n";
import type { WhiteboardToolProps } from "../../../extensions/api";
import { Network } from "lucide-react";

import { useActiveTool } from "../../../hooks";
import { MIND_TOOL_ID } from "../../../constants/tools";
import { ChromeButton } from "../../../chrome";

const MindMap = ({ run }: WhiteboardToolProps) => {
  const { t } = useWhiteboardI18n();
  const active = useActiveTool() === MIND_TOOL_ID;

  return (
    <ChromeButton
      label={t("toolbar.mind")}
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
