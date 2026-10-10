import type { WhiteboardToolProps } from "../../../extensions/api";
import { memo } from "react";
import { ArrowUpRight } from "lucide-react";
import useCreateArrow from "./useCreateArrow";
import { useCreateElementType } from "../../../hooks";
import { ECreateBoardElementType } from "../../../types";
import { ChromeButton } from "../../../chrome";

const Arrow = memo(({ run }: WhiteboardToolProps) => {
  const createType = useCreateElementType();
  const active = createType === ECreateBoardElementType.StraightArrow;

  useCreateArrow();

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
