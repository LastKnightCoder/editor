import { useMemo } from 'react';
import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import { Tooltip } from "antd";
import { Mark } from "@/components/Editor/types";

import { useMemoizedFn } from "ahooks";

import { isMarkActive } from "../../hovering-bar-configs/utils.ts";
import classnames from "classnames";

import styles from './index.module.less';
import { Editor, Range, Transforms } from "slate";


interface IMarkTextProps {
  mark: Mark;
  tooltip: string;
  icon: React.ReactNode;
}

const MarkText = (props: IMarkTextProps) => {
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
      Transforms.collapse(editor, { edge: 'end' });
    }
  });

  return (
    <Tooltip
      title={tooltip}
      trigger={'hover'}
    >
      <div
        className={classnames(styles.markTextContainer, { [styles.active]: isActive })}
        onClick={handleClick}
      >
        {icon}
      </div>
    </Tooltip>
  )
}

export default MarkText;