import { memo } from "react";
import { Frame as FrameIcon } from "lucide-react";
import { ECreateBoardElementType } from "../../../types";
import { useBoard, useCreateElementType } from "../../../hooks";
import { ChromeButton } from "../../../chrome";
import useCreateFrame from "./useCreateFrame";

const Frame = memo(() => {
  const board = useBoard();
  const createType = useCreateElementType();
  const active = createType === ECreateBoardElementType.Frame;

  useCreateFrame();

  return (
    <ChromeButton
      label="画框"
      active={active}
      onClick={() => {
        board.currentCreateType = active
          ? ECreateBoardElementType.None
          : ECreateBoardElementType.Frame;
      }}
    >
      <FrameIcon strokeWidth={1.75} />
    </ChromeButton>
  );
});

Frame.displayName = "Frame";

export default Frame;
