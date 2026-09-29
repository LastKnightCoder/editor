import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import { useContext, useEffect, useMemo, useState, memo } from "react";
import { useMemoizedFn } from "ahooks";
import { Editor, Range, Transforms } from "slate";

import { Tooltip } from "../../../../ui/Tooltip";
import { Highlighter, ChevronDown } from "lucide-react";
import HighlightSelect from "../HighlightSelect";

import { isMarkActive } from "../../hovering-bar-configs/utils";
import { HoveringBarContext } from "../../../../components/HoveringToolbar";
import FloatingSubmenu from "../../../../components/HoveringToolbar/FloatingSubmenu";

import classnames from "classnames";

const HighlightText = memo(() => {
  const editor = useSlate();
  const selection = useSlateSelection();

  const [open, setOpen] = useState<boolean>(false);
  const active = useMemo(() => {
    return isMarkActive("highlight", editor, selection);
  }, [editor, selection]);

  const { isHoveringBarShow, isCompact, submenuTrigger } = useContext(HoveringBarContext);

  const onOpenChange = useMemoizedFn((open: boolean) => {
    setOpen(open);
  });

  useEffect(() => {
    if (!isHoveringBarShow) {
      setOpen(false);
    }
  }, [isHoveringBarShow]);

  const handleClick = useMemoizedFn((label?: string) => {
    const selection = editor.selection;
    Editor.addMark(editor, "highlight", label);
    if (selection && !Range.isCollapsed(selection)) {
      ReactEditor.focus(editor);
      Transforms.collapse(editor, { edge: "end" });
    }
    if (isCompact) {
      setOpen(false);
    }
  });

  return (
    <FloatingSubmenu
      open={open}
      onOpenChange={onOpenChange}
      trigger={submenuTrigger}
      isHoveringBarShow={isHoveringBarShow}
      content={<HighlightSelect onClick={handleClick} />}
      zIndex={10100}
      gap={10}
    >
      <Tooltip content={"高亮"}>
        <div
          className={classnames(
            "flex h-8 cursor-pointer items-center justify-center gap-0.5 rounded-lg px-1.5 transition-all duration-200",
            "ed-toolbar-item",
            active && "is-active"
          )}
        >
          <Highlighter size={16} strokeWidth={2.5} />
          <ChevronDown size={12} className="opacity-50" strokeWidth={2.5} />
        </div>
      </Tooltip>
    </FloatingSubmenu>
  );
});

export default HighlightText;
