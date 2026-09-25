import { memo } from "react";
import { ArrowUpRight } from "lucide-react";
import useCreateArrow from "./useCreateArrow";
import { useCreateElementType, useBoard } from "../../../hooks";
import { ECreateBoardElementType } from "../../../types";
import { ChromeButton } from "../../../chrome";

const Arrow = memo(() => {
  const board = useBoard();
  const createType = useCreateElementType();
  const active = createType === ECreateBoardElementType.StraightArrow;

  useCreateArrow();

  return (
    <ChromeButton
      label="箭头"
      active={active}
      onClick={() => {
        board.currentCreateType = active
          ? ECreateBoardElementType.None
          : ECreateBoardElementType.StraightArrow;
      }}
    >
      <ArrowUpRight strokeWidth={1.75} />
    </ChromeButton>
  );
});

export default Arrow;
