import React from "react";
import { Transforms } from 'slate';
import { Popover } from "antd";
import classnames from "classnames";
import { ReactEditor, RenderElementProps, useReadOnly, useSlate } from "slate-react";

import { UnderlineElement } from "@editor/types";
import InlineChromiumBugfix from "@editor/components/InlineChromiumBugFix";
import ColorSelect from '@editor/components/ColorSelect';

import styles from './index.module.less';

interface UnderlineProps {
  attributes: RenderElementProps['attributes'];
  element: UnderlineElement;
  children: React.ReactNode;
}

const colors = [{
  label: 'yellow',
  color: 'rgb(255, 212, 0)',
}, {
  label: 'green',
  color: 'rgb(42, 157, 143)',
}, {
  label: 'blue',
  color: 'rgb(162, 210, 255)',
}, {
  label: 'purple',
  color: 'rgb(94, 84, 142)',
}, {
  label: 'red',
  color: 'rgb(239, 35, 60)',
}];

const Underline = (props: UnderlineProps) => {
  const { attributes, children, element } = props;
  const { lineType, color, colorSelectOpen } = element;

  const editor = useSlate();
  const readonly = useReadOnly();

  const setColorSelectOpen = (open: boolean) => {
    if (readonly) return;
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { colorSelectOpen: open }, { at: path });
  }

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setColorSelectOpen(!colorSelectOpen);
  }

  const selectColor = (color: string) => {
    if (readonly) return;
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { color }, { at: path });
    localStorage.setItem('underline-color', color);
  }

  return (
    <Popover
      trigger={'click'}
      open={!readonly && colorSelectOpen}
      onOpenChange={setColorSelectOpen}
      content={<ColorSelect colors={colors} selectColor={color} onSelectColor={selectColor} />}
      placement={'bottom'}
    >
      <span
        onClick={onClick}
        className={classnames(styles.underline, styles[color], styles[lineType])}
        {...attributes}
      >
        <InlineChromiumBugfix />
          {children}
        <InlineChromiumBugfix />
      </span>
    </Popover>
  )
}

export default Underline;