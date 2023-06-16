import {ReactEditor, useSlate, useSlateSelection} from "slate-react";
import {Editor, Range, Transforms} from "slate";
import React, {useCallback} from "react";

const useHoveringBarConfig = () => {
  const editor = useSlate();
  const selection = useSlateSelection();

  const isMarkActive = useCallback((mark: 'bold' | 'italic' | 'code' | 'underline' | 'highlight') => {
    if (!selection) {
      return false;
    }
    const marks = Editor.marks(editor);
    return !!(marks && marks[mark]);
  }, [editor, selection]);

  const toggleMark = useCallback((event: React.MouseEvent, mark: 'bold' | 'italic' | 'code' | 'underline' | 'highlight') => {
    const selection = editor.selection;
    console.log('selection', selection);
    const marks = Editor.marks(editor);
    if (marks && marks[mark]) {
      Editor.removeMark(editor, mark);
    } else {
      Editor.addMark(editor, mark, true);
    }
    event.preventDefault();
    if (selection && !Range.isCollapsed(selection)) {
      Transforms.collapse(editor, { edge: 'end' });
      ReactEditor.focus(editor);
    }
  }, [editor]);

  const configs = [{
    text: 'B',
    mark: 'bold',
  }, {
    text: 'I',
    mark: 'italic',
  }, {
    text: 'U',
    mark: 'underline',
  }, {
    text: 'H',
    mark: 'highlight',
  }, {
    text: 'C',
    mark: 'code',
  }] as const;

  return configs.map(config => ({
    text: config.text,
    active: isMarkActive(config.mark),
    onClick: (event: React.MouseEvent) => toggleMark(event, config.mark),
  }));
}

export default useHoveringBarConfig;