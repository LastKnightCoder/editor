import { memo, useContext } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Sparkles } from "lucide-react";
import type { BoardElement } from "../../../types";
import { AttrBarContext, ChromeButton } from "../../../chrome";
import { useBoard } from "../../../hooks";
import { requestOpenDocument } from "../../../plugins/DocumentPlugin";
import SketchPopover from "../SketchPopover";

interface DocumentSetterProps {
  element: BoardElement;
  onChange: (element: BoardElement) => void;
}

/** 文档卡：展开（同双击 / ↵）、相关（同 R，宿主装配了放入入口才有）、PDF 卡翻页（同 [ ]）+ 笔触；纸面统一 surface，没有配色项 */
const DocumentSetter = memo(({ element, onChange }: DocumentSetterProps) => {
  const board = useBoard();
  const { side } = useContext(AttrBarContext);
  const api = board.extensions?.api;
  const relatedShortcut = api?.getShortcut("tau.document.related");
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
      {element.entityRef?.kind === "pdf" &&
        (
          [
            ["上一页", "tau.document.page-prev", ChevronLeft],
            ["下一页", "tau.document.page-next", ChevronRight],
          ] as const
        ).map(([label, command, Icon]) => (
          <ChromeButton
            key={command}
            label={label}
            kbd={api?.getShortcut(command) ?? undefined}
            tooltipPlacement={side}
            onClick={() => void api?.execute(command).catch(() => {})}
          >
            <Icon strokeWidth={1.75} />
          </ChromeButton>
        ))}
      {relatedShortcut && !board.readonly && element.entityRef?.kind !== "pdf" && (
        <ChromeButton
          label="相关"
          kbd={relatedShortcut}
          tooltipPlacement={side}
          onClick={() => void api?.execute("tau.document.related").catch(() => {})}
        >
          <Sparkles strokeWidth={1.75} />
        </ChromeButton>
      )}
      <SketchPopover target={element} onChange={onChange} />
    </>
  );
});

export default DocumentSetter;
