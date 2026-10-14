import type { WhiteboardToolProps } from "../../../extensions/api";
import { memo, useState } from "react";
import { PersonStanding } from "lucide-react";
import { Popover } from "@tau/ui";
import { useBoard, useActiveTool } from "../../../hooks";
import { ChromeButton, stopCanvasEvents } from "../../../chrome";
import { STICKMAN_TOOL_ID } from "../../../constants/tools";
import { StickmanUtil } from "../../../utils/StickmanUtil";
import PosePicker from "../../Stickman/PosePicker";

/** 人物：点开是姿态面板，选中后在画布上单击放置 */
const StickmanTool = memo(({ run }: WhiteboardToolProps) => {
  const board = useBoard();
  const [open, setOpen] = useState(false);
  const active = useActiveTool() === STICKMAN_TOOL_ID;

  const pick = (pose: string) => {
    run({ pose });
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={v => {
        setOpen(v);
        // 再点一次已激活的人物工具 = 取消
        if (!v && active && !board.activeToolOptions) run();
      }}
      placement="bottom"
      arrow={false}
      className="min-w-0"
      trigger={
        <ChromeButton
          label="人物"
          sub
          active={active}
          onClick={e => {
            if (active) {
              e.preventDefault();
              run();
            }
          }}
        >
          <PersonStanding strokeWidth={1.75} />
        </ChromeButton>
      }
    >
      {open && (
        <div {...stopCanvasEvents} className="w-[340px] p-2">
          <PosePicker {...StickmanUtil.getPrevStyle()} onPick={pick} />
        </div>
      )}
    </Popover>
  );
});

export default StickmanTool;
