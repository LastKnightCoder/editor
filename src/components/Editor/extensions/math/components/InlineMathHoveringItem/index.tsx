import React, { useMemo } from 'react';
import { Editor, Transforms } from "slate";
import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import { useMemoizedFn } from "ahooks";
import { Tooltip } from "antd";
import SVG from "react-inlinesvg";

import classnames from "classnames";
import { unWrapInlineMath, wrapInlineMath } from "@/components/Editor/utils";

import math from "@/assets/hovering_bar/math.svg";

import styles from "./index.module.less";

const LinkHoveringItem = () => {
  const editor = useSlate();
  const selection = useSlateSelection();

  const isActive = useMemo(() => {
    if (!selection) {
      return false;
    }
    const [math] = Editor.nodes(editor, {
      match: n => !Editor.isEditor(n) && n.type === 'inline-math',
    });
    return !!math;
  }, [editor, selection]);

  const handleClick = useMemoizedFn((event: React.MouseEvent) => {
    try {
      if (isActive) {
        unWrapInlineMath(editor);
        return;
      }
      wrapInlineMath(editor);
    } finally {
      event.preventDefault();
      ReactEditor.focus(editor);
      Transforms.collapse(editor, { edge: 'end' });
    }
  })

  return (
    <Tooltip
      title={'行内公式'}
      trigger={'hover'}
    >
      <div
        className={classnames(styles.markTextContainer, { [styles.active]: isActive })}
        onClick={handleClick}
      >
        <SVG src={math} style={{ fill: 'currentcolor', width: 20, height: 20 }} />
      </div>
    </Tooltip>
  )
}

export default LinkHoveringItem;