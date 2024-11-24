import { Editor, Path, Transforms, Element, Range, Node } from 'slate';
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
  Color, ITabsContent, AudioElement, VideoElement
} from "../types";
import { EGalleryMode, EStyledColor } from '../constants';
import { codeBlockMap } from "../extensions/code-block";
import { STYLED_TEXT_SELECT_COLOR_KEY } from "@editor/extensions/styled-text/components/StyledText";
import { AIElement } from "@editor/types/element/ai.ts";

interface InsertElementOptions {
  select?: boolean;
  reverse?: boolean;
}

export const setOrInsertNode = (editor: Editor, node: BlockElement, options: InsertElementOptions = {}) => {
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
    if (node.type === 'code-block') {
      console.log('paragraph is empty');
    }
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

interface AudioParams {
  src: string;
  uploading?: boolean;
}

export const insertAudio = (editor: Editor, params: AudioParams) => {
  const audio: AudioElement = {
    type: 'audio',
    ...params,
    children: [{
      type: 'formatted',
      text: ''
    }]
  }
  return setOrInsertNode(editor, audio);
}

interface VideoParams {
  src: string;
  uploading?: boolean;
  playbackRate?: number;
}

export const insertVideo = (editor: Editor, params: VideoParams) => {
  const video: VideoElement = {
    type: 'video',
    ...params,
    children: [{
      type: 'formatted',
      text: ''
    }]
  }
  return setOrInsertNode(editor, video);
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
  const insertPath =  setOrInsertNode(editor, tableElement);
  if (!insertPath) return;
  const firstCellPath = [...insertPath, 0, 0];
  Transforms.select(editor, {
    anchor: Editor.start(editor, firstCellPath),
    focus: Editor.start(editor, firstCellPath),
  });

  return insertPath;
}

export const insertCodeBlock = (editor: Editor, language = 'javascript', code = '') => {
  const uuid = getUuid();
  const res = setOrInsertNode(editor, {
    type: 'code-block',
    code,
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

const defaultCustomBlockContent = `const Component = () => {
  
}`

export const insertCustomBlock = (editor: Editor) => {
  const path = setOrInsertNode(editor, {
    type: 'custom-block',
    content: defaultCustomBlockContent,
    children: [{ type: 'formatted', text: '' }]
  });
  if (!path) return;

  const focusEditor = (leftTryCount: number) => {
    if (leftTryCount <= 0) return;
    setTimeout(() => {
      const node = Node.get(editor, path);
      if (node && Element.isElement(node)) {
        const focusEvent = new CustomEvent('preview-editor-focus', {
          detail: node,
        });
        document.dispatchEvent(focusEvent);
      } else {
        focusEditor(leftTryCount - 1);
      }
    }, 100);
  }

  focusEditor(5);
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

export const insertImageGallery = (editor: Editor) => {
  return setOrInsertNode(editor, {
    type: 'image-gallery',
    mode: EGalleryMode.Horizontal,
    images: [],
    children: [{
      type: 'formatted',
      text: ''
    }]
  })
}

export const insertTabs = (editor: Editor) => {
  const key = getUuid();
  const tabs: ITabsContent[] = [{
    key,
    title: 'Tab 1',
    content: [{
      type: 'paragraph',
      children: [{
        type: 'formatted',
        text: ''
      }]
    }]
  }];

  return setOrInsertNode(editor, {
    type: 'tabs',
    tabsContent: tabs,
    activeKey: key,
    children: [{
      type: 'paragraph',
      children: [{
        type: 'formatted',
        text: ''
      }]
    }]
  }, {
    select: true
  });
}

export const insertAIBlock = (editor: Editor) => {
  const aiElement: AIElement = {
    type: 'ai',
    children: [{
      type: 'paragraph',
      children: [{
        type: 'formatted',
        text: ''
      }]
    }]
  }

  return setOrInsertNode(editor, aiElement, { select: true });
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

export const unwrapUnderline = (editor: Editor) => {
  Transforms.unwrapNodes(editor, {
    match: n => n.type === 'underline',
  });
}

export const wrapUnderline = (editor: Editor) => {
  const { selection } = editor;
  const [node] = getCurrentTextNode(editor);
  if (selection && !Range.isCollapsed(selection) && node.type === 'formatted') {
    const text = Editor.string(editor, selection);
    editor.deleteBackward('character');
    Transforms.wrapNodes(editor, {
      type: 'underline',
      color: localStorage.getItem('underline-color') || 'red',
      lineType: localStorage.getItem('underline-line-type') || 'solid',
      colorSelectOpen: true,
      children: [{ type: 'formatted', text }],
    }, {
      at: selection,
      split: true
    })
  }
}

export const unwrapStyledText = (editor: Editor) => {
  Transforms.unwrapNodes(editor, {
    match: n => n.type === 'styled-text',
  });
}

export const wrapStyledText = (editor: Editor) => {
  const { selection } = editor;
  const [node] = getCurrentTextNode(editor);
  if (selection && !Range.isCollapsed(selection) && node.type === 'formatted') {
    const text = Editor.string(editor, selection);
    editor.deleteBackward('character');
    Transforms.wrapNodes(editor, {
      type: 'styled-text',
      color: localStorage.getItem(STYLED_TEXT_SELECT_COLOR_KEY) as EStyledColor || EStyledColor.Red,
      children: [{ type: 'formatted', text }],
    }, {
      at: selection,
      split: true
    })
  }
}
