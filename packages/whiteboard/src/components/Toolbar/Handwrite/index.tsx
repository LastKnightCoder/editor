import type { WhiteboardToolProps } from "../../../extensions/api";
import { memo } from "react";
import { PenLine } from "lucide-react";
import { ECreateBoardElementType } from "../../../types";
import { useCreateElementType } from "../../../hooks";
import { ChromeButton } from "../../../chrome";
import useCreateHandwrite from "./useCreateHandwrite";

const Handwrite = memo(({ run }: WhiteboardToolProps) => {
  const createType = useCreateElementType();
  const active = createType === ECreateBoardElementType.Handwrite;

  useCreateHandwrite();

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
