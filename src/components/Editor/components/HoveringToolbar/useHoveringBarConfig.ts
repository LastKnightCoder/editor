import {ReactEditor, useSlate, useSlateSelection} from "slate-react";
import {Editor, Range} from "slate";
import React, {useCallback, useMemo} from "react";
import {wrapInlineMath, wrapLink, unwrapLink, unWrapInlineMath} from "@/components/Editor/utils";

import { Mark, IConfigItem } from "./types";

const useHoveringBarConfig = () => {
  const editor = useSlate();
  const selection = useSlateSelection();

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

  const toggleMark = useCallback((event: React.MouseEvent, mark: Mark) => {
    const selection = editor.selection;
    const marks = Editor.marks(editor);
    if (marks && marks[mark]) {
      Editor.removeMark(editor, mark);
    } else {
      Editor.addMark(editor, mark, true);
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
    text: 'M',
    mark: 'highlight',
  }, {
    text: 'C',
    mark: 'code',
  }] as const;

  const configs: IConfigItem[] = [
    ...formattedConfigs.map(config => ({
      text: config.text,
      active: isMarkActive(config.mark),
      onClick: (event: React.MouseEvent) => toggleMark(event, config.mark),
    })),
    {
      text: '$',
      active: isInlineMathActive,
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
        console.log('link', isLinkActive);
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
    }
  ];

  return configs;
}

export default useHoveringBarConfig;