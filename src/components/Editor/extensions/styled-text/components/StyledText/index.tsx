import { useState } from 'react';
import useTheme from "@/hooks/useTheme.ts";
import { ReactEditor, useReadOnly, useSlate } from "slate-react";
import { Popover } from "antd";
import { Transforms } from "slate";

import { StyledTextColorStyle, EStyledColor } from '@editor/constants';
import { StyledTextElement } from "@editor/types";
import InlineChromiumBugfix from "@editor/components/InlineChromiumBugFix";
import ColorSelect from "@editor/components/ColorSelect";

import { IExtensionBaseProps } from '../../../types';
import styles from './index.module.less';

export const STYLED_TEXT_SELECT_COLOR_KEY = 'styled-text-last-select-color'

const StyledText = (props: IExtensionBaseProps<StyledTextElement>) => {
  const { attributes, element, children } = props;

  const { color } = element;
  const editor = useSlate();
  const { isDark } = useTheme();
  const readonly = useReadOnly();

  const { color: textColor, backgroundColor } = StyledTextColorStyle[isDark ? 'dark' : 'light'][color] || {};

  const [colorSelectOpen, setColorSelectOpen] = useState(false);

  const onSelectColor = (color: EStyledColor) => {
    if (readonly) return;
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { color }, { at: path });
    localStorage.setItem(STYLED_TEXT_SELECT_COLOR_KEY, color);
  }

  const onOpenChange = (open: boolean) => {
    if (readonly) return;
    setColorSelectOpen(open);
  }

  return (
    <Popover
      trigger={'click'}
      open={!readonly && colorSelectOpen}
      onOpenChange={onOpenChange}
      content={(
        <ColorSelect<EStyledColor>
          colors={Object.values(StyledTextColorStyle[isDark ? 'dark' : 'light']).map(item => ({ ...item, color: item.backgroundColor }))}
          onSelectColor={onSelectColor}
          selectColor={color}
        />
      )}
      placement={'bottom'}
    >
      <span
        className={styles.styledText}
        style={{
          color: textColor,
          backgroundColor,
        }}
        {...attributes}
      >
        <InlineChromiumBugfix/>
          {children}
        <InlineChromiumBugfix/>
      </span>
    </Popover>
  )
}

export default StyledText;
