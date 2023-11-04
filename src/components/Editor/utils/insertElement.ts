import { Editor, Path, Transforms, Element, Range } from 'slate';
import { v4 as getUuid } from "uuid";

import { isParagraphAndEmpty, isCollapsed, replaceNode, getCurrentTextNode } from "./editor";

import {
  BlockElement,
  ImageElement,
  TableCellElement,
  TableElement,
  TableRowElement,
  LinkElement,
  MultiColumnItemElement,
  Color
} from "../types";
import { codeBlockMap } from "../extensions/code-block";

interface InsertElementOptions {
  select?: boolean;
  reverse?: boolean;
}

const setOrInsertNode = (editor: Editor, node: BlockElement, options: InsertElementOptions = {}) => {
  if (!isCollapsed(editor)) {
    return;
  }
  const [match] = Editor.nodes(editor, {
    match: n => n.type === 'paragraph',
    mode: 'lowest',
  });
  if (!match) {
    return;
  }
  if (isParagraphAndEmpty(editor)) {
    return replaceNode(editor, node, n => n.type === 'paragraph', options);
  } else {
    Transforms.insertNodes(editor, node, options);
    return Path.next(match[1]);
  }
}

export const insertHeader = (editor: Editor, level: 1 | 2 | 3 | 4 | 5 | 6) => {
  setOrInsertNode(editor, {
    type: 'header',
    level,
    children: [{ type: 'formatted', text: '' }],
  }, {
    select: true,
  });
}

export const insertCallout = (editor: Editor, type: 'tip' | 'warning' | 'info' | 'danger' | 'note') => {
  setOrInsertNode(editor, {
    type: 'callout',
    calloutType: type,
    title: '',
    children: [{
      type: 'paragraph',
      children: [{
        type: 'formatted',
        text: '',
      }],
    }],
  }, {
    select: true,
  });
}

export const insertDetails = (editor: Editor) => {
  setOrInsertNode(editor, {
    type: 'detail',
    title: '',
    open: true,
    children: [{
      type: 'paragraph',
      children: [{
        type: 'formatted',
        text: '',
      }],
    }],
  }, {
    select: true,
  });
}

interface ImageParams {
  url: string;
  alt?: string;
  pasteUploading?: boolean;
}

export const insertImage = (editor: Editor, params: ImageParams) => {
  const image: ImageElement = { type: 'image', ...params, children: [{ type: 'formatted', text: '' }] }
  return setOrInsertNode(editor, image);
}

export const insertBulletList = (editor: Editor) => {
  return setOrInsertNode(editor, {
    type: 'bulleted-list',
    children: [{
      type: 'list-item',
      children: [{
        type: 'paragraph',
        children: [{
          type: 'formatted',
          text: '',
        }],
      }],
    }]
  });
}

export const insertNumberedList = (editor: Editor) => {
  return setOrInsertNode(editor, {
    type: 'numbered-list',
    children: [{
      type: 'list-item',
      children: [{
        type: 'paragraph',
        children: [{
          type: 'formatted',
          text: '',
        }],
      }],
    }]
  });
}

export const insertCheckList = (editor: Editor) => {
  return setOrInsertNode(editor, {
    type: 'check-list',
    children: [{
      type: 'check-list-item',
      checked: false,
      children: [{
        type: 'paragraph',
        children: [{
          type: 'formatted',
          text: '',
        }],
      }],
    }]
  });
}

export const insertBlockMath = (editor: Editor) => {
  return setOrInsertNode(editor, {
    type: 'block-math',
    tex: '',
    children: [{ type: 'formatted', text: '' }]
  });
}

export const insertTable = (editor: Editor, rows: number, cols: number) => {
  // 根据行数和列数创建一个表格
  const tableRowElements: TableRowElement[] = Array.from({ length: rows }).map(() => {
    const tableCellElements: TableCellElement[] = Array.from({ length: cols }).map(() => {
      return {
        type: 'table-cell',
        children: [{ type: 'formatted', text: '' }],
      };
    });
    return {
      type: 'table-row',
      children: tableCellElements,
    };
  });
  const tableElement: TableElement = {
    type: 'table',
    children: tableRowElements,
  }
  return setOrInsertNode(editor, tableElement);
}

export const insertCodeBlock = (editor: Editor, language = 'javascript') => {
  const uuid = getUuid();
  const res = setOrInsertNode(editor, {
    type: 'code-block',
    code: '',
    language: language,
    uuid,
    children: [{ type: 'formatted', text: '' }]
  });
  // 聚焦到 code-block
  setTimeout(() => {
    const codeMirrorEditor = codeBlockMap.get(uuid);
    if (codeMirrorEditor) {
      codeMirrorEditor.focus();
    }
  }, 100);
  return res;
}

export const insertMermaid = (editor: Editor) => {
  return setOrInsertNode(editor, {
    type: 'mermaid',
    chart: '',
    children: [{ type: 'formatted', text: '' }]
  });
}

export const insertTikz = (editor: Editor) => {
  return setOrInsertNode(editor, {
    type: 'tikz',
    content: '',
    children: [{ type: 'formatted', text: '' }]
  });
}

export const insertGraphviz = (editor: Editor) => {
  return setOrInsertNode(editor, {
    type: 'graphviz',
    dot: '',
    children: [{ type: 'formatted', text: '' }]
  });
}

export const insertHTMLBlock = (editor: Editor) => {
  return setOrInsertNode(editor, {
    type: 'html-block',
    html: '',
    children: [{ type: 'formatted', text: '' }]
  });
}

export const insertCustomBlock = (editor: Editor) => {
  return setOrInsertNode(editor, {
    type: 'custom-block',
    content: '',
    children: [{ type: 'formatted', text: '' }]
  });
}

export const insertDivideLine = (editor: Editor) => {
  return setOrInsertNode(editor, {
    type: 'divide-line',
    children: [{ type: 'formatted', text: '' }],
  });
}

export const insertMultiColumnsContainer = (editor: Editor, columns = 2) => {
  if (columns < 1) {
    return;
  }

  const children: MultiColumnItemElement[] = Array.from({ length: columns }).map(() => {
    return {
      type: 'multi-column-item',
      children: [{
        type: 'paragraph',
        children: [{
          type: 'formatted',
          text: '',
        }],
      }],
    }
  });

  const res =  setOrInsertNode(editor, {
    type: 'multi-column-container',
    children
  }, {
    select: true,
  });

  if (res) {
    Transforms.select(editor, {
      anchor: Editor.start(editor, [...res, 0]),
      focus: Editor.start(editor, [...res, 0])
    });
  }

  return res;
}

export const insertHighlightBlock = (editor: Editor, color = 'red' as Color) => {
  return setOrInsertNode(editor, {
    type: 'highlight-block',
    color,
    children: [{
      type: 'paragraph',
      children: [{
        type: 'formatted',
        text: '',
      }],
    }],
  }, {
    select: true
  })
}

const isLinkActive = (editor: Editor) => {
  const [link] = Editor.nodes(editor, {
    match: n =>
      !Editor.isEditor(n) && Element.isElement(n) && n.type === 'link',
  })
  return !!link
}

export const unwrapLink = (editor: Editor) => {
  Transforms.unwrapNodes(editor, {
    match: n =>
      !Editor.isEditor(n) && Element.isElement(n) && n.type === 'link',
  })
}

export const wrapLink = (editor: Editor, url: string, open = false) => {
  if (isLinkActive(editor)) {
    unwrapLink(editor);
  }

  const { selection } = editor;
  const isCollapsed = selection && Range.isCollapsed(selection);
  const link: LinkElement = {
    type: 'link',
    url,
    openEdit: open,
    children: isCollapsed ? [{ type: 'formatted', text: url }] : [],
  }

  if (isCollapsed) {
    Transforms.insertNodes(editor, link);
  } else {
    Transforms.wrapNodes(editor, link, { split: true });
    Transforms.collapse(editor, { edge: 'end' });
  }
}

export const unWrapInlineMath = (editor: Editor) => {
  Transforms.unwrapNodes(editor, {
    match: n => n.type === 'inline-math',
  });
}

export const wrapInlineMath = (editor: Editor) => {
  const { selection } = editor;
  const [node] = getCurrentTextNode(editor);
  if (selection && !Range.isCollapsed(selection) && node.type === 'formatted') {
    const text = Editor.string(editor, selection);
    ['bold', 'code', 'italic', 'underline', 'highlight', 'color'].forEach((type) => {
      Editor.removeMark(editor, type);
    });
    editor.deleteBackward('character');
    Transforms.wrapNodes(editor, {
      type: 'inline-math',
      tex: text,
      children: [{ type: 'formatted', text: '' }]
    }, {
      at: selection,
      split: true
    })
  }
}
