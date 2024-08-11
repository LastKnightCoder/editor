import { produce } from 'immer';
import React from "react";
import Tips from './Tips';

import { Modal } from 'antd';
import { useMemoizedFn } from 'ahooks';
import { PdfHighlight, EHighlightColor, EHighlightTextStyle } from '@/types';

interface HighlightProps {
  open: boolean;
  arrowDirection?: 'left' | 'right' | 'top' | 'bottom';
  highlight: PdfHighlight;
  onHighlightChange?: (highlight: PdfHighlight) => void;
  removeHighlight?: () => void;
  onClose?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

const HighlightTips = (props: HighlightProps) => {
  const {
    highlight,
    open,
    arrowDirection,
    onHighlightChange,
    onClose,
    removeHighlight,
    className,
    style
  } = props;

  const onNotesChange = useMemoizedFn((notes: PdfHighlight['notes']) => {
    const newHighlight = produce(highlight, (draft) => {
      draft.notes = notes;
    });
    onHighlightChange?.(newHighlight);
  });

  const onSelectColor = useMemoizedFn((color: EHighlightColor) => {
    const newHighlight = produce(highlight, (draft) => {
      draft.color = color;
    });
    onHighlightChange?.(newHighlight);
  });

  const onSelectTextStyle = useMemoizedFn((highlightTextStyle: EHighlightTextStyle) => {
    const newHighlight = produce(highlight, (draft) => {
      draft.highlightTextStyle = highlightTextStyle;
    });
    onHighlightChange?.(newHighlight);
  });

  const onRemove = () => {
    Modal.confirm({
      title: '确定删除此高亮吗？',
      onOk: () => {
        removeHighlight?.();
      },
      okText: '确定',
      cancelText: '取消',
      okButtonProps: {
        danger: true,
      }
    })
  }

  if (!open) return null;

  return (
    <Tips
      activeHighlightTextStyle={highlight.highlightTextStyle}
      activeColor={highlight.color}
      notes={highlight.notes}
      arrowDirection={arrowDirection}
      onNotesChange={onNotesChange}
      onSelectColor={onSelectColor}
      onSelectTextStyle={onSelectTextStyle}
      onClose={onClose}
      onRemove={onRemove}
      className={className}
      style={style}
    />
  )
}

export default HighlightTips;