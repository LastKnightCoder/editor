import type { WhiteboardToolProps } from "../../../extensions/api";
import { memo } from "react";
import { Frame as FrameIcon } from "lucide-react";
import { ECreateBoardElementType } from "../../../types";
import { useCreateElementType } from "../../../hooks";
import { ChromeButton } from "../../../chrome";
import useCreateFrame from "./useCreateFrame";

const Frame = memo(({ run }: WhiteboardToolProps) => {
  const createType = useCreateElementType();
  const active = createType === ECreateBoardElementType.Frame;

  useCreateFrame();

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
