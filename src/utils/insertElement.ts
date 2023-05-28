import { Editor, Transforms } from 'slate';
import {ReactEditor} from "slate-react";
import {FormattedText, ImageElement, TableCellElement, TableElement, TableRowElement} from "../custom-types";
import {v4 as getUuid} from "uuid";

export const insertCallout = (editor: Editor, type: 'tip' | 'warning' | 'info' | 'danger' | 'note') => {
  Transforms.insertNodes(editor, {
    type: 'callout',
    calloutType: type,
    title: '',
    children: [{
      type: 'paragraph',
      children: [{
        type: 'formatted',
        text: '',
      }]
    }],
  });
  const [callout] = Editor.nodes(editor, {
    match: n => n.type === 'callout',
  });
  if (!callout) {
    return;
  }

  setTimeout(() => {
    ReactEditor.focus(editor);
    Transforms.select(editor, [...callout[1], 0, 0])
  }, 200)
}

export const insertDetails = (editor: Editor) => {
  // 如果当前段落是空的，删除该段落
  const [paragraph] = Editor.nodes(editor, {
    match: n => n.type === 'paragraph',
  });
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  if (paragraph && paragraph[0].children.length === 1 && paragraph[0].children[0].text === '') {
    Transforms.removeNodes(editor, {
      at: paragraph[1],
    });
  }
  Transforms.insertNodes(editor, {
    type: 'detail',
    children: [{
      type: 'paragraph',
      children: [{
        type: 'formatted',
        text: '',
      }]
    }],
  });
  const [detail] = Editor.nodes(editor, {
    match: n => n.type === 'detail',
  });
  if (!detail) {
    return;
  }

  setTimeout(() => {
    ReactEditor.focus(editor);
    Transforms.select(editor, [...detail[1], 0, 0])
  }, 200)
}

interface ImageParams {
  url: string;
  alt?: string;
  pasteUploading?: boolean;
}

export const insertImage = (editor: Editor, params: ImageParams) => {
  const text: FormattedText = { type: 'formatted', text: '' }
  const image: ImageElement = { type: 'image', ...params, children: [text] }
  Transforms.insertNodes(editor, image)
}

export const insertBulletList = (editor: Editor) => {
  Transforms.insertNodes(editor, {
    type: 'bulleted-list',
    children: [{
      type: 'list-item',
      children: [{
        type: 'paragraph',
        children: [{
          text: '',
          type: 'formatted'
        }]
      }]
    }]
  });
}

export const insertNumberedList = (editor: Editor) => {
  Transforms.insertNodes(editor, {
    type: 'numbered-list',
    children: [{
      type: 'list-item',
      children: [{
        type: 'paragraph',
        children: [{
          text: '',
          type: 'formatted'
        }]
      }]
    }]
  });
}

export const insertCheckList = (editor: Editor) => {
  Transforms.insertNodes(editor, {
    type: 'check-list',
    checked: false,
    children: [{
      type: 'check-list-item',
      checked: false,
      children: [{
        type: 'paragraph',
        children: [{
          text: '',
          type: 'formatted'
        }]
      }]
    }]
  });
}

export const insertBlockMath = (editor: Editor) => {
  Transforms.insertNodes(editor, {
    type: 'block-math',
    tex: 'f(x)',
    children: [{
      type: 'formatted',
      text: ''
    }]
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
  Transforms.insertNodes(editor, tableElement);
}

export const insertCodeBlock = (editor: Editor, language = 'javascript') => {
  const uuid = getUuid();
  Transforms.setNodes(editor, { type: 'code-block', code: '', language: language, uuid, children: [{ type: 'formatted', text: '' }] });
  // 聚焦到 code-block
  setTimeout(() => {
    const codeMirrorEditor = editor.codeBlockMap.get(uuid);
    if (codeMirrorEditor) {
      codeMirrorEditor.focus();
    }
  }, 20);
}

export const insertMermaid = (editor: Editor) => {
  Transforms.insertNodes(editor, {
    type: 'mermaid',
    chart: '',
    children: [{
      type: 'formatted',
      text: '',
    }]
  });
}

export const insertTikz = (editor: Editor) => {
  Transforms.insertNodes(editor, {
    type: 'tikz',
    content: '',
    children: [{
      type: 'formatted',
      text: '',
    }]
  });
}

export const insertGraphviz = (editor: Editor) => {
  Transforms.insertNodes(editor, {
    type: 'graphviz',
    dot: '',
    children: [{
      type: 'formatted',
      text: '',
    }]
  });
}