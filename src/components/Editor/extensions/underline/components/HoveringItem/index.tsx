import React, { useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import { Tooltip } from "antd";
import { Editor, Transforms } from "slate";
import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import { unwrapUnderline, wrapUnderline } from "@/components/Editor/utils";
import SVG from "react-inlinesvg";
import classnames from "classnames";
import underline from '@/assets/hovering_bar/underline.svg';

import styles from "./index.module.less";

const HoveringItem = () => {
  const editor = useSlate();
  const selection = useSlateSelection();

  const isActive = useMemo(() => {
    if (!selection) {
      return false;
    }
    const [link] = Editor.nodes(editor, {
      match: n => !Editor.isEditor(n) && n.type === 'underline',
    });
    return !!link;
  }, [editor, selection]);

  const handleClick = useMemoizedFn((event: React.MouseEvent) => {
    try {
      if (isActive) {
        unwrapUnderline(editor);
        return;
      }
      wrapUnderline(editor);
    } finally {
      event.preventDefault();
      ReactEditor.focus(editor);
      Transforms.collapse(editor, { edge: 'end' });
    }
  });

  return (
    <Tooltip
      title={'下划线'}
      trigger={'hover'}
    >
      <div
        className={classnames(styles.item, {
          [styles.active]: isActive,
        })}
        onClick={handleClick}
      >
        <SVG src={underline} style={{ fill: 'currentcolor', width: 18, height: 18 }} />
      </div>
    </Tooltip>
  )
}

export default HoveringItem;
