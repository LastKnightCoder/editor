import { memo, useContext } from "react";
import { Maximize2 } from "lucide-react";
import type { BoardElement } from "../../../types";
import { AttrBarContext, ChromeButton } from "../../../chrome";
import { useBoard } from "../../../hooks";
import { requestOpenDocument } from "../../../plugins/DocumentPlugin";
import SketchPopover from "../SketchPopover";

interface DocumentSetterProps {
  element: BoardElement;
  onChange: (element: BoardElement) => void;
}

/** 文档卡：展开（同双击 / ↵）+ 笔触；纸面统一 surface，没有配色项 */
const DocumentSetter = memo(({ element, onChange }: DocumentSetterProps) => {
  const board = useBoard();
  const { side } = useContext(AttrBarContext);
  return (
    <>
      <ChromeButton
        label="展开"
        kbd={board.extensions?.api.getShortcut("tau.document.open") ?? undefined}
        tooltipPlacement={side}
        onClick={() => requestOpenDocument(board, element.id)}
      >
        <Maximize2 strokeWidth={1.75} />
      </ChromeButton>
      <SketchPopover target={element} onChange={onChange} />
    </>
  );
});

export default DocumentSetter;
