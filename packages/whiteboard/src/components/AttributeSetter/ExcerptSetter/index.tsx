import { useAttributeI18n } from "../../../attributes-i18n";
import { memo, useContext } from "react";
import { Undo2 } from "lucide-react";
import type { BoardElement } from "../../../types";
import { AttrBarContext, ChromeButton } from "../../../chrome";
import { useBoard } from "../../../hooks";
import { EXCERPT_OPEN_SOURCE_EVENT } from "../../../plugins/ExcerptPlugin";
import SketchPopover from "../SketchPopover";

interface ExcerptSetterProps {
  element: BoardElement;
  onChange: (element: BoardElement) => void;
}

/** 摘录：回到原文（同卡面底部的来源条）+ 笔触 */
const ExcerptSetter = memo(({ element, onChange }: ExcerptSetterProps) => {
  const { t } = useAttributeI18n();
  const board = useBoard();
  const { side } = useContext(AttrBarContext);
  return (
    <>
      {element.source && (
        <ChromeButton
          label={t("attributes.source")}
          tooltipPlacement={side}
          onClick={() => board.emit(EXCERPT_OPEN_SOURCE_EVENT, element.id)}
        >
          <Undo2 strokeWidth={1.75} />
        </ChromeButton>
      )}
      <SketchPopover target={element} onChange={onChange} />
    </>
  );
});

export default ExcerptSetter;
