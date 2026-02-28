import { memo } from "react";
import { useMemoizedFn } from "ahooks";
import { Tooltip } from "antd";
import { Sparkles } from "lucide-react";
import { Editor, Range, Transforms } from "slate";
import { ReactEditor, useSlateSelection, useSlateStatic } from "slate-react";
import classnames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";
import type { SerializedSelection } from "@/services/content-editing";
import { openInlineAIComposer } from "../panel-manager";

const InlineAIHoveringBarItem = memo(() => {
  const editor = useSlateStatic();
  const selection = useSlateSelection();
  const themeColors = useThemeColors();

  const hasSelection =
    !!selection &&
    !Range.isCollapsed(selection) &&
    Editor.string(editor, selection).trim().length > 0;

  const serializeSelection = (
    range: typeof selection,
  ): SerializedSelection | null => {
    if (!range) return null;
    return {
      anchor: {
        path: [...range.anchor.path],
        offset: range.anchor.offset,
      },
      focus: {
        path: [...range.focus.path],
        offset: range.focus.offset,
      },
      isCollapsed: Range.isCollapsed(range),
    };
  };

  const handleMouseDown = useMemoizedFn((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const selectionBeforeOpen = serializeSelection(selection);
    openInlineAIComposer(editor, "hovering", {
      initialSelection: selectionBeforeOpen,
    });
    Transforms.deselect(editor);
    ReactEditor.blur(editor);
  });

  return (
    <Tooltip title="Ask AI" trigger="hover">
      <div
        className={classnames(
          "flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-all duration-200",
          hasSelection
            ? classnames(
                themeColors.textClass,
                themeColors.hoverClass,
                themeColors.hoverTextClass,
              )
            : "cursor-not-allowed text-gray-400 opacity-60",
        )}
        onMouseDown={hasSelection ? handleMouseDown : undefined}
      >
        <Sparkles size={16} strokeWidth={2.5} />
      </div>
    </Tooltip>
  );
});

export default InlineAIHoveringBarItem;
