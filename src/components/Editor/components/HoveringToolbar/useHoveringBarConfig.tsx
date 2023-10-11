import {ReactEditor, useSlate, useSlateSelection} from "slate-react";
import {Editor, Range, Transforms} from "slate";
import React, {useCallback, useMemo, useState} from "react";
import SVG from 'react-inlinesvg';

import {wrapInlineMath, wrapLink, unwrapLink, unWrapInlineMath} from "@/components/Editor/utils";

import bold from '@/assets/hovering_bar/bold.svg';
import italic from '@/assets/hovering_bar/italic.svg';
import underline from '@/assets/hovering_bar/underline.svg';
import strikethrough from '@/assets/hovering_bar/strikethrough.svg';
import code from '@/assets/hovering_bar/code.svg';
import math from '@/assets/hovering_bar/math.svg';
import link from '@/assets/hovering_bar/link.svg';

import ColorText from "./ColorText";
import HighlightText from "./HighlightText";
import { Mark, IConfigItem } from "./types";

const useHoveringBarConfig = () => {
  const editor = useSlate();
  const selection = useSlateSelection();
  const [openColorSelect, setOpenColorSelect] = useState(false);
  const [openHighlightSelect, setOpenHighlightSelect] = useState(false);

  const isMarkActive = useCallback((mark: Mark) => {
    if (!selection) {
      return false;
    }
    const marks = Editor.marks(editor);
    return !!(marks && marks[mark]);
  }, [editor, selection]);
  const isLinkActive = useMemo(() => {
    if (!selection) {
      return false;
    }
    const [link] = Editor.nodes(editor, {
      match: n => !Editor.isEditor(n) && n.type === 'link',
    });
    return !!link;
  }, [editor, selection]);
  const isInlineMathActive = useMemo(() => {
    if (!selection) {
      return false;
    }
    const [math] = Editor.nodes(editor, {
      match: n => !Editor.isEditor(n) && n.type === 'inline-math',
    });
    return !!math;
  }, [editor, selection]);

  const toggleMark = useCallback((event: React.MouseEvent, mark: Mark, value: any = true) => {
    const selection = editor.selection;
    const marks = Editor.marks(editor);
    if (marks && marks[mark]) {
      Editor.removeMark(editor, mark);
    } else {
      Editor.addMark(editor, mark, value);
    }
    event.preventDefault();
    if (selection && !Range.isCollapsed(selection)) {
      ReactEditor.focus(editor);
    }
  }, [editor]);

  const formattedConfigs = [{
    text: <SVG src={bold} style={{ fill: 'currentcolor', width: 16, height: 16 }} />,
    mark: 'bold',
    tooltip: '加粗',
  }, {
    text: <SVG src={italic} style={{ fill: 'currentcolor', width: 14, height: 14 }} />,
    mark: 'italic',
    tooltip: '斜体',
  }, {
    text: <SVG src={underline} style={{ fill: 'currentcolor', width: 18, height: 18 }} />,
    mark: 'underline',
    tooltip: '下划线',
  }, {
    text: <SVG src={strikethrough} style={{ fill: 'currentcolor', width: 18, height: 18 }} />,
    mark: 'strikethrough',
    tooltip: '删除线',
  }, {
    text: <SVG src={code} style={{ fill: 'currentcolor', width: 18, height: 18 }} />,
    mark: 'code',
    tooltip: '代码',
  }] as const;

  const configs: IConfigItem[] = [
    ...formattedConfigs.map(config => ({
      text: config.text,
      active: isMarkActive(config.mark),
      onClick: (event: React.MouseEvent) => toggleMark(event, config.mark),
      tooltip: config.tooltip,
    })),
    {
      text: <SVG src={math} style={{ fill: 'currentcolor', width: 20, height: 20 }} />,
      active: isInlineMathActive,
      style: {
        fontStyle: 'italic',
      },
      tooltip: '行内公式',
      onClick: (event: React.MouseEvent) => {
        try {
          if (isInlineMathActive) {
            unWrapInlineMath(editor);
            return;
          }
          wrapInlineMath(editor);
        } finally {
          event.preventDefault();
        }
      }
    },
    {
      text: <SVG src={link} style={{ fill: 'currentcolor', width: 16, height: 16 }} />,
      active: isLinkActive,
      tooltip: '链接',
      onClick: (event: React.MouseEvent) => {
        try {
          if (isLinkActive) {
            unwrapLink(editor);
            return;
          }
          wrapLink(editor, '', true);
        } finally {
          event.preventDefault();
        }
      }
    },
    {
      text: (
        <HighlightText
          open={openHighlightSelect}
          onClick={(event, label: string | undefined) => {
            const selection = editor.selection;
            Editor.addMark(editor, 'highlight', label);
            event.preventDefault();
            if (selection && !Range.isCollapsed(selection)) {
              ReactEditor.focus(editor);
              Transforms.collapse(editor, { edge: 'end' });
            }
          }}
        />
      ),
      style: {
        width: '56px',
      },
      tooltip: '高亮',
      active: isMarkActive('highlight'),
      onClick: (event: React.MouseEvent) => {
        setOpenHighlightSelect(!openHighlightSelect);
        setOpenColorSelect(false);
        event.preventDefault();
        event.stopPropagation();
      }
    },
    {
      text: (
        <ColorText
          open={openColorSelect}
          onClick={(event, color: string) => {
            const selection = editor.selection;
            Editor.addMark(editor, 'color', color);
            event.preventDefault();
            if (selection && !Range.isCollapsed(selection)) {
              ReactEditor.focus(editor);
              Transforms.collapse(editor, { edge: 'end' });
            }
          }}
        />
      ),
      tooltip: '颜色',
      style: {
        width: '56px',
      },
      active: isMarkActive('color'),
      onClick: (event) => {
        setOpenColorSelect(!openColorSelect);
        setOpenHighlightSelect(false);
        event.preventDefault();
        event.stopPropagation();
      },
    }
  ];

  return configs;
}

export default useHoveringBarConfig;