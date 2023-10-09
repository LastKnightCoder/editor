import {ReactEditor, useSlate, useSlateSelection} from "slate-react";
import {Editor, Range, Transforms} from "slate";
import React, {useCallback, useMemo, useState} from "react";
import {wrapInlineMath, wrapLink, unwrapLink, unWrapInlineMath} from "@/components/Editor/utils";

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
    text: 'B',
    mark: 'bold',
  }, {
    text: 'I',
    mark: 'italic',
  }, {
    text: 'U',
    mark: 'underline',
  }, {
    text: 'S',
    mark: 'strikethrough',
  }, {
    text: '</>',
    mark: 'code',
  }] as const;

  const configs: IConfigItem[] = [
    ...formattedConfigs.map(config => ({
      text: config.text,
      active: isMarkActive(config.mark),
      onClick: (event: React.MouseEvent) => toggleMark(event, config.mark),
      style: {
        fontFamily: config.mark === 'code' ? 'var(--mono-font)' : undefined,
        fontStyle: config.mark === 'italic' ? 'italic' : undefined,
        fontWeight: config.mark === 'bold' ? 'bold' : undefined,
        textDecoration:
          config.mark === 'underline'
            ? 'underline'
            : config.mark === 'strikethrough'
              ? 'line-through'
              : undefined,
      }
    })),
    {
      text: 'f(x)',
      active: isInlineMathActive,
      style: {
        fontStyle: 'italic',
      },
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
      text: 'L',
      active: isLinkActive,
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
        width: '48px',
      },
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
      style: {
        width: '48px',
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