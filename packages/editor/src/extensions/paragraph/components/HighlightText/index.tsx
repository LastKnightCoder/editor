import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import { useContext, useEffect, useMemo, useState, memo } from "react";
import { useMemoizedFn } from "ahooks";
import { Editor, Range, Transforms } from "slate";

import { Popover, Tooltip } from "antd";
import { Highlighter, ChevronDown } from "lucide-react";
import HighlightSelect from "../HighlightSelect";

import { isMarkActive } from "../../hovering-bar-configs/utils";
import { HoveringBarContext } from "../../../../components/HoveringToolbar";

import classnames from "classnames";
import useThemeColors from "../../../../hooks/useThemeColors";

const HighlightText = memo(() => {
  const editor = useSlate();
  const selection = useSlateSelection();
  const themeColors = useThemeColors();

  const [open, setOpen] = useState<boolean>(false);
  const active = useMemo(() => {
    return isMarkActive("highlight", editor, selection);
  }, [editor, selection]);

  const { isHoveringBarShow } = useContext(HoveringBarContext);

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
  });

  return (
    <Tooltip title={"高亮"} trigger={"hover"}>
      <Popover
        open={open}
        content={<HighlightSelect onClick={handleClick} />}
        placement="bottom"
        trigger={"hover"}
        onOpenChange={onOpenChange}
        zIndex={10100}
        styles={{
          container: {
            padding: 0,
            marginTop: "0.75em",
            background: "transparent",
            boxShadow: "none",
            border: "none",
            backdropFilter: "none",
          },
        }}
        arrow={false}
      >
        <div
          className={classnames(
            "flex items-center justify-center gap-0.5 px-1.5 h-8 rounded-lg cursor-pointer transition-all duration-200",
            active
              ? themeColors.activeClass
              : classnames(
                  themeColors.textClass,
                  themeColors.hoverClass,
                  themeColors.hoverTextClass,
                ),
          )}
        >
          <Highlighter size={16} strokeWidth={2.5} />
          <ChevronDown size={12} className="opacity-50" strokeWidth={2.5} />
        </div>
      </Popover>
    </Tooltip>
  );
});

export default HighlightText;
