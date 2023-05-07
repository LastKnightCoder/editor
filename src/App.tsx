import { useState } from "react";
import CodeBlock from "./components/CodeBlock";
import Callout from "./components/Callout";
import Header from "./components/Header";
import {createEditor, Descendant, Transforms, Range, Editor, Point, Element as SlateElement, Node as SlateNode } from 'slate';
import {Slate, Editable, withReact, RenderElementProps, ReactEditor, RenderLeafProps} from 'slate-react';
import { withHistory } from 'slate-history';
import isHotKey from 'is-hotkey';
import {CodeBlockElement, HeaderElement, ParagraphElement} from "./custom-types";
import { Editor as CodeMirrorEditor } from 'codemirror';
import { v4 as getUuid } from 'uuid';
import FormattedText from "./components/FormattedText";
import {isParagraphEmpty} from "./utils/element";
import { insertCodeBlock } from "./utils/editor";
import {message} from "antd";

const defaultValue: Descendant[] = [{
  type: 'paragraph',
  children: [{
    type: 'formatted',
    text: '这是一个 demo'
  }]
}, {
  type: 'code-block',
  language: 'javascript',
  code: 'console.log("hello world")',
  uuid: getUuid(),
  children: [{
    type: 'formatted',
    text: '这是一个 demo'
  }]
}, {
  type: 'paragraph',
  children: [{
    type: 'formatted',
    text: '这是一个 demo'
  }, {
    type: 'formatted',
    text: '加粗',
    bold: true
  }, {
    type: 'formatted',
    text: '斜体',
    italic: true
  }, {
    type: 'formatted',
    text: '下划线',
    underline: true
  }, {
    type: 'formatted',
    text: '高亮',
    highlight: true
  }]
}, {
  type: 'callout',
  calloutType: 'info',
  children: [{
    type: 'paragraph',
    children: [{
      type: 'formatted',
      text: '这是一个 demo'
    }]
  }]
}];

const overrideDefaultSetting = (editor: Editor) => {
  const { isBlock, isVoid, isInline, deleteBackward } = editor;
  editor.isBlock = (element) => {
    const blockTypes = ['paragraph', 'header', 'callout'];
    return blockTypes.includes(element.type) ? true : isBlock(element);
  }
  editor.isVoid = (element) => {
    const voidTypes = ['code-block', 'empty'];
    return voidTypes.includes(element.type) ? true : isVoid(element);
  }
  editor.isInline = (element) => {
    const inlineTypes = ['formatted'];
    return inlineTypes.includes(element.type) ? true : isInline(element);
  }
  editor.codeBlockMap = new Map<string, CodeMirrorEditor>();
  editor.deleteBackward = (...args) => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const [match] = Editor.nodes(editor, {
        match: n => SlateElement.isElement(n) && editor.isBlock(n),
      });
      if (match) {
        const [, path] = match;
        const start = Editor.start(editor, path);
        if (Point.equals(selection.anchor, start)) {
          // 如果前一个是 code-block，删除当前 paragraph，将光标移动到 code-block 的末尾
          const prevPath = Editor.before(editor, path);
          if (prevPath) {
            const [prevMatch] = Editor.nodes(editor, {
              at: prevPath,
              match: n => SlateElement.isElement(n) && n.type === 'code-block',
            });
            if (prevMatch) {
              Editor.nodes(editor, {
                match: n => SlateElement.isElement(n) && n.type === 'paragraph',
              });
              Transforms.removeNodes(editor, { at: path });
              const [element] = prevMatch;
              const codeBlockMap = editor.codeBlockMap;
              const codeMirrorEditor = codeBlockMap.get((element as CodeBlockElement).uuid);
              codeMirrorEditor && codeMirrorEditor.focus();
              return;
            }
          }
        }
      }
    }
    if (selection && Range.isCollapsed(selection)) {
      const [match] = Editor.nodes(editor, {
        match: n => SlateElement.isElement(n) && n.type === 'header',
      });
      if (match) {
        const [, path] = match;
        const isStart = Editor.isStart(editor, selection.anchor, path);
        if (isStart) {
          // 将标题转换为 paragraph
          Transforms.setNodes(editor, {
            type: 'paragraph'
          });
          return;
        }
      }
    }
    deleteBackward(...args);
  }
  return editor;
}

const withMarkdownShortcuts = (editor: Editor) => {
  const { insertText } = editor;
  editor.insertText = (text) => {
    const { selection } = editor;
    if (text.endsWith(' ') && selection && Range.isCollapsed(selection)) {
      const [match] = Editor.nodes(editor, {
        match: n => SlateElement.isElement(n) && n.type === 'paragraph',
      });
      if (match) {
        const [parentElement] = match;
        const [nodeMatch] = Editor.nodes(editor, {
          match: n => SlateNode.isNode(n) && n.type === 'formatted',
        });
        const [node, path] = nodeMatch;
        // node 是否是 paragraph 的第一个子节点
        const isFirst = (parentElement as ParagraphElement).children[0] === node;
        if (isFirst) {
          const { text: nodeText } = node;
          if (nodeText.startsWith('```')) {
            // 删除 ``` 符号
            Transforms.delete(editor, {
              at: {
                anchor: {
                  path,
                  offset: 0
                },
                focus: {
                  path,
                  offset: nodeText.length
                }
              }
            });
            // get language
            const language = nodeText.slice(3);
            insertCodeBlock(editor, language);
            return;
          }
          const levelMatched = nodeText.match(/^#{1,6}/);
          if (levelMatched) {
            const level = levelMatched[0].length as HeaderElement['level'];
            Transforms.delete(editor, {
              at: {
                anchor: {
                  path,
                  offset: 0
                },
                focus: {
                  path,
                  offset: level
                }
              }
            });
            Transforms.setNodes(editor, {
              type: 'header',
              level
            });
            return;
          }
        }
      }
    }
    insertText(text);
  }
  return editor;
}

type Plugin = (editor: Editor) => Editor;

const applyPlugin = (editor: Editor, plugins: Plugin[]) => {
  return plugins.reduce((acc, plugin) => plugin(acc), editor);
}

const registerInlineHotKey = (editor: Editor, event: React.KeyboardEvent<HTMLDivElement>) => {
  const configs = [{
    hotKey: 'mod+b',
    mark: 'bold'
  }, {
    hotKey: 'mod+i',
    mark: 'italic'
  }, {
    hotKey: 'mod+u',
    mark: 'underline'
  }, {
    hotKey: 'mod+h',
    mark: 'highlight'
  }, {
    hotKey: 'mod+e',
    mark: 'code'
  }] as const;

  for (const config of configs) {
    const { hotKey, mark } = config;
    if (isHotKey(hotKey, event)) {
      event.preventDefault();
      const { selection } = editor;
      if (selection) {
        const marks = Editor.marks(editor);
        if (marks && marks[mark]) {
          Editor.addMark(editor, config.mark, false);
        } else {
          Editor.addMark(editor, mark, true);
        }
      }
      return config.mark;
    }
  }
}

const registerBlockHotKey = (editor: Editor, event: React.KeyboardEvent<HTMLDivElement>) => {
  const configs = [{
    hotKey: 'alt+=',
    action: (editor: Editor) => {
      // 如果是 header，增加 level
      // 如果是 paragraph，转换为 header
      const [match] = Editor.nodes(editor, {
        match: n => SlateElement.isElement(n) && (n.type === 'paragraph' || n.type === 'header')
      });
      if (!match) {
        return;
      }
      const [element, path] = match;
      if (element.type === 'header') {
        const headerElement = element as HeaderElement;
        const currentLevel = headerElement.level;
        if (currentLevel === 1) {
          return;
        }
        Transforms.setNodes(editor, { level: (currentLevel - 1) as HeaderElement['level'] }, { at: path });
      }
      if (element.type === 'paragraph') {
        Transforms.setNodes(editor, { type: 'header', level: 6 }, { at: path });
      }
    }
  }, {
    hotKey: 'alt+-',
    action: (editor: Editor) => {
      // 如果是 header，减少 level
      const [match] = Editor.nodes(editor, {
        match: n => SlateElement.isElement(n) && n.type === 'header'
      });
      if (!match) {
        return;
      }
      const [element, path] = match;
      const headerElement = element as HeaderElement;
      const currentLevel = headerElement.level;
      if (currentLevel === 6) {
        // 如果是 h6，转换为 paragraph
        Transforms.setNodes(editor, { type: 'paragraph' }, { at: path });
        return;
      }
      Transforms.setNodes(editor, { level: (currentLevel + 1) as HeaderElement['level'] }, { at: path });
    }
  }] as const;

  for (const config of configs) {
    const { hotKey, action } = config;
    if (isHotKey(hotKey, event)) {
      action(editor);
    }
  }
}


const App = () => {
  const [editor] = useState(() => applyPlugin(createEditor(), [withReact, withHistory, overrideDefaultSetting, withMarkdownShortcuts]));
  const [initValue] = useState(() => {
    const content = localStorage.getItem('content');
    if (content) {
      return JSON.parse(content);
    }
    return defaultValue;
  });
  const [value, setValue] = useState<Descendant[]>(initValue);

  const renderElement = (props: RenderElementProps) => {
    const { attributes, children, element } = props;
    const setCode = (code: string) => {
      const path = ReactEditor.findPath(editor, element);
      Transforms.setNodes(editor, { code }, { at: path });
    }
    const onDidMount = (codeMirrorEditor: CodeMirrorEditor) => {
      editor.codeBlockMap.set((element as CodeBlockElement).uuid, codeMirrorEditor)
    }
    const onWillUnmount = () => {
      editor.codeBlockMap.delete((element as CodeBlockElement).uuid);
    }

    switch (element.type) {
      case 'code-block':
        return (
          <CodeBlock
            attributes={attributes}
            element={element}
            onDidMount={onDidMount}
            onWillUnmount={onWillUnmount}
            onChange={setCode}
          >
            {children}
          </CodeBlock>
        )
      case 'callout':
        return (
          <Callout attributes={attributes} element={element}>
            {children}
          </Callout>
        )
      case 'header':
        return (
          <Header attributes={attributes} element={element}>
            {children}
          </Header>
        )
      case 'list-item':
        return (
          <li {...attributes}>
            {children}
          </li>
        )
      case 'bulleted-list':
        return (
          <ul {...attributes}>
            {children}
          </ul>
        )
      case 'numbered-list':
        return (
          <ol {...attributes}>
            {children}
          </ol>
        )
      default:
        return <p {...attributes}>{children}</p>
    }
  }

  const renderLeaf = (props: RenderLeafProps) => {
    const { attributes, children, leaf } = props;

    switch (leaf.type) {
      case 'formatted':
        return <FormattedText leaf={leaf} attributes={attributes} >{children}</FormattedText>
      default:
        return <span {...attributes}>{children}</span>
    }
  }

  const save = (value: Descendant[]) => {
    localStorage.setItem('content', JSON.stringify(value));
    setValue(value);
  }

  const quitInlineMode = () => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const [match] = Editor.nodes(editor, {
        match: n => n.type === 'formatted',
      })
      if (match) {
        ['bold', 'italic', 'underline', 'highlight', 'code'].forEach((type) => {
          Editor.removeMark(editor, type);
        });
      }
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', overflow: 'hidden' }}>
      <Slate editor={editor} value={initValue} onChange={save} >
        <Editable
          style={{ flex: 2, padding: '50px 40px', minWidth: '800px' }}
          renderElement={renderElement}
          renderLeaf={renderLeaf}
          onKeyDown={(event) => {
            if (isHotKey('escape', event)) {
              event.preventDefault();
              quitInlineMode();
            }
            registerInlineHotKey(editor, event);
            registerBlockHotKey(editor, event);
            if(isHotKey('mod+`', event)) {
              event.preventDefault();
              const { selection } = editor;
              if (selection && Range.isCollapsed(selection)) {
                const [match] = Editor.nodes(editor, {
                  match: n => SlateElement.isElement(n) && n.type === 'paragraph',
                });
                if (!match) {
                  return;
                }
                const [element, path] = match;
                if (Editor.isStart(editor, selection.anchor, path)) {
                  if (isParagraphEmpty(element as ParagraphElement)) {
                    const uuid = getUuid();
                    Transforms.setNodes(editor, { type: 'code-block', code: '', language: 'javascript', uuid, children: [{ type: 'formatted', text: '' }] });
                    // 聚焦到 code-block
                    setTimeout(() => {
                      const codeMirrorEditor = editor.codeBlockMap.get(uuid);
                      if (codeMirrorEditor) {
                        codeMirrorEditor.focus();
                      }
                    }, 0);
                  } else {
                    message.error('段落不为空');
                  }
                } else {
                  message.error('请在段落开头输入');
                }
              }
            }
          }}
        />
      </Slate>
      <pre style={{ maxHeight: '100vh', overflow: 'auto', padding: 40, margin: 0, boxSizing: 'border-box' }}>
        <code>{JSON.stringify(value, null, 2)}</code>
      </pre>
    </div>
  )
}

export default App;