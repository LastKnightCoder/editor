import { useMemo, memo } from "react";
import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import { Tooltip } from "../../../../ui/Tooltip";
import { Mark } from "../../../types";

import { useMemoizedFn } from "ahooks";

import { isMarkActive } from "../../hovering-bar-configs/utils";
import classnames from "classnames";

import { Editor, Range, Transforms } from "slate";

interface IMarkTextProps {
  mark: Mark;
  tooltip: string;
  icon: React.ReactNode;
}

const MarkText = memo((props: IMarkTextProps) => {
  const { mark, tooltip, icon } = props;
  const editor = useSlate();
  const selection = useSlateSelection();

  const isActive = useMemo(() => {
    return isMarkActive(mark, editor, selection);
  }, [editor, selection, mark]);

  const handleClick = useMemoizedFn((event: React.MouseEvent) => {
    const marks = Editor.marks(editor);
    if (marks && marks[mark]) {
      Editor.removeMark(editor, mark);
    } else {
      Editor.addMark(editor, mark, true);
    }
    event.stopPropagation();
    if (selection && !Range.isCollapsed(selection)) {
      ReactEditor.focus(editor);
      Transforms.collapse(editor, { edge: "end" });
    }
  });

  return (
    <Tooltip content={tooltip}>
      <div
        className={classnames(
          "flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-all duration-200",
          "ed-toolbar-item",
          isActive && "is-active"
        )}
        onClick={handleClick}
      >
        {icon}
      </div>
    </Tooltip>
  );
});

export default MarkText;
