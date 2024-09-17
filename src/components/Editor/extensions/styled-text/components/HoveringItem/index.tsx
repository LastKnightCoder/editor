import React, { useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import { Tooltip } from "antd";
import { Editor, NodeEntry, Transforms } from "slate";
import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import useTheme from "@/hooks/useTheme.ts";
import { unwrapStyledText, wrapStyledText } from "@/components/Editor/utils";
import SVG from "react-inlinesvg";
import classnames from "classnames";

import styledTextIcon from '@/assets/hovering_bar/styled-text.svg';
import { StyledTextElement } from "@editor/types";
import { StyledTextColorStyle } from "@editor/constants";

import styles from "./index.module.less";

const HoveringItem = () => {
  const editor = useSlate();
  const selection = useSlateSelection();
  const { isDark } = useTheme();

  const isActive = useMemo(() => {
    if (!selection) {
      return false;
    }
    const [styledText] = Editor.nodes(editor, {
      match: n => !Editor.isEditor(n) && n.type === 'styled-text',
    });
    return !!styledText;
  }, [editor, selection]);

  const activeColor = useMemo(() => {
    if (!selection) return 'currentColor';
    const [styledText] = Editor.nodes(editor, {
      match: n => !Editor.isEditor(n) && n.type === 'styled-text',
    });
    if (!styledText) return 'currentColor';
    const [node] = styledText as NodeEntry<StyledTextElement>;
    return StyledTextColorStyle[isDark ? 'dark' : 'light'][node.color].color
  }, [editor, isDark, selection]);

  const handleClick = useMemoizedFn((event: React.MouseEvent) => {
    try {
      if (isActive) {
        unwrapStyledText(editor);
        return;
      }
      wrapStyledText(editor);
    } finally {
      event.preventDefault();
      ReactEditor.focus(editor);
      Transforms.collapse(editor, { edge: 'end' });
    }
  });

  return (
    <Tooltip
      title={'样式文本'}
      trigger={'hover'}
    >
      <div
        className={classnames(styles.item, {
          [styles.active]: isActive,
        })}
        onClick={handleClick}
      >
        <SVG src={styledTextIcon} style={{ fill: activeColor, width: 18, height: 18 }} />
      </div>
    </Tooltip>
  )
}

export default HoveringItem;
