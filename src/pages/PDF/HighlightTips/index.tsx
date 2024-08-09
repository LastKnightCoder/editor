import { produce } from 'immer';
import React from "react";
import Tips from './Tips';

import { useMemoizedFn } from 'ahooks';

import { Highlight } from "../types.ts";
import { EHighlightColor, EHighlightTextStyle } from "../constants";

interface HighlightProps {
  open: boolean;
  highlight: Highlight;
  onHighlightChange: (highlight: Highlight) => void;
  removeHighlight: () => void;
  onClose: () => void;
  className?: string;
  style?: React.CSSProperties;
}

const HighlightTips = (props: HighlightProps) => {
  const { highlight, open, onHighlightChange, onClose, className, style } = props;

  const onNotesChange = useMemoizedFn((notes: Highlight['notes']) => {
    const newHighlight = produce(highlight, (draft) => {
      draft.notes = notes;
    });
    onHighlightChange(newHighlight);
  });

  const onSelectColor = useMemoizedFn((color: EHighlightColor) => {
    const newHighlight = produce(highlight, (draft) => {
      draft.color = color;
    });
    onHighlightChange(newHighlight);
  });

  const onSelectTextStyle = useMemoizedFn((highlightTextStyle: EHighlightTextStyle) => {
    const newHighlight = produce(highlight, (draft) => {
      draft.highlightTextStyle = highlightTextStyle;
    });
    onHighlightChange(newHighlight);
  });

  if (!open) return null;

  return (
    <Tips
      activeHighlightTextStyle={highlight.highlightTextStyle}
      activeColor={highlight.color}
      notes={highlight.notes}
      onNotesChange={onNotesChange}
      onSelectColor={onSelectColor}
      onSelectTextStyle={onSelectTextStyle}
      onClose={onClose}
      className={className}
      style={style}
    />
  )
}

export default HighlightTips;