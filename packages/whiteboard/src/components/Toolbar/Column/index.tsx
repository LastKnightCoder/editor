import { useWhiteboardI18n } from "../../../i18n";
import type { WhiteboardToolProps } from "../../../extensions/api";
import { memo } from "react";
import { Columns3 } from "lucide-react";

import { useActiveTool } from "../../../hooks";
import { ChromeButton } from "../../../chrome";
import { COLUMN_TOOL_ID } from "../../../constants/tools";

const Column = memo(({ run }: WhiteboardToolProps) => {
  const { t } = useWhiteboardI18n();
  const active = useActiveTool() === COLUMN_TOOL_ID;

  return (
    <ChromeButton
      label={t("toolbar.column")}
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
