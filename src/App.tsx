import { useState } from "react";
import { Button, message } from "antd";

import { createEditor, Descendant, Transforms, Range, Editor, Element as SlateElement } from 'slate';
import { Slate, Editable, withReact, RenderElementProps, ReactEditor, RenderLeafProps } from 'slate-react';
import { withHistory } from 'slate-history';

import { Editor as CodeMirrorEditor } from 'codemirror';
import { v4 as getUuid } from 'uuid';
import isHotKey from 'is-hotkey';

import CodeBlock from "./components/CodeBlock";
import Callout from "./components/Callout";
import Header from "./components/Header";
import FormattedText from "./components/FormattedText";

import { getFarthestCurrentElement, getCurrentTextNode, isParagraphEmpty, applyPlugin } from "./utils";
import { initValue as defaultValue } from "./configs";
import { withMarkdownShortcuts, withOverrideSettings } from "./plugins";
import { CodeBlockElement, HeaderElement, ParagraphElement } from "./custom-types";



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
      const node = getCurrentTextNode(editor);
      if (node && node.type === 'formatted') {
        const marks = Editor.marks(editor);
        if (marks && (marks as FormattedText)[mark]) {
          Editor.removeMark(editor, mark);
        } else {
          Editor.addMark(editor, mark, true);
        }
      }
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
  const [editor] = useState(() => applyPlugin(createEditor(), [withReact, withHistory, withOverrideSettings, withMarkdownShortcuts]));
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
      <Button onClick={() => { const curEle = getFarthestCurrentElement(editor); console.log('::curEle', curEle); const curLeafNode =  getCurrentTextNode(editor); console.log('::curLeafNode', curLeafNode) }} >获取当前</Button>
    </div>
  )
}

export default App;