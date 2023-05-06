import { useState } from "react";
import CodeBlock from "./components/CodeBlock";
import Highlight from "./components/Highlight";
import {createEditor, Descendant, Transforms, Range, Editor} from 'slate';
import {Slate, Editable, withReact, RenderElementProps, ReactEditor, RenderLeafProps} from 'slate-react';
import { withHistory } from 'slate-history';
import isHotKey from 'is-hotkey';

const defaultValue: Descendant[] = [{
  type: 'paragraph',
  children: [{
    type: 'normal',
    text: '这是一个 demo'
  }]
}, {
  type: 'code-block',
  language: 'javascript',
  code: 'console.log("hello world")',
  children: [{
    type: 'normal',
    text: ''
  }]
}, {
  type: 'paragraph',
  children: [{
    type: 'normal',
    text: '这是一个 demo'
  }, {
    type: 'bold',
    text: '加粗'
  }, {
    type: 'italic',
    text: '斜体'
  }, {
    type: 'underline',
    text: '下划线'
  }, {
    type: 'highlight',
    text: '高亮'
  }]
},];


const App = () => {
  const [editor] = useState(() => withHistory(withReact(createEditor())));
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
    switch (element.type) {
      case 'code-block':
        return (
          <div contentEditable={false} style={{ userSelect: 'none' }}>
            <CodeBlock {...attributes} {...element} {...props} onChange={(code) => { setCode(code) }}>{children}</CodeBlock>
          </div>
        )
      default:
        return <p {...attributes}>{children}</p>
    }
  }

  const renderLeaf = (props: RenderLeafProps) => {
    const { attributes, children, leaf } = props;

    switch (leaf.type) {
      case 'bold':
        return <strong {...attributes}>{children}</strong>
      case 'italic':
        return <em {...attributes}>{children}</em>
      case 'underline':
        return <u {...attributes}>{children}</u>
      case 'highlight':
        return <Highlight {...attributes} >{children}</Highlight>
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
        match: n => n.type === 'highlight',
      })
      if (match) {
        const [, path] = match;
        if (Editor.isEnd(editor, selection.anchor, path)) {
          Editor.addMark(editor, 'type', 'normal');
        }
      }
    }
  }

  return (
    <div style={{ maxWidth: 700, margin: '50px auto', overflow: 'hidden' }}>
      <Slate editor={editor} value={initValue} onChange={save} >
        <Editable
          renderElement={renderElement}
          renderLeaf={renderLeaf}
          onKeyDown={(event) => {
            if (isHotKey('escape', event)) {
              event.preventDefault();
              quitInlineMode();
            }
            if(isHotKey('mod+h', event)) {
              event.preventDefault();
              const { selection } = editor;
              if (selection) {
                const marks = Editor.marks(editor);
                if (marks && marks.type === 'highlight') {
                  Editor.addMark(editor, 'type', 'normal');
                } else {
                  Editor.addMark(editor, 'type', 'highlight');
                }
              }
            }
            if(isHotKey('mod+`', event)) {
              event.preventDefault();
              const { selection } = editor;
              if (selection && Range.isCollapsed(selection)) {
                if (Editor.isStart(editor, selection.anchor, selection)) {
                  Transforms.setNodes(editor, { type: 'code-block', code: '', language: 'javascript', children: [{ type: 'normal', text: '' }] })
                }
              }
            }
          }}
        />
      </Slate>
      <pre>
        <code>{JSON.stringify(value, null, 2)}</code>
      </pre>
    </div>
  )
}

export default App;