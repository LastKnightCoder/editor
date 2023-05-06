import { useState } from "react";
import CodeMirror from "./components/CodeBlock";
import {createEditor, Descendant, Transforms} from 'slate';
import {Slate, Editable, withReact, RenderElementProps, ReactEditor} from 'slate-react';


const defaultValue = [{
  type: 'paragraph',
  children: [{
    text: '这是一个 demo'
  }]
}, {
  type: 'code-block',
  language: 'javascript',
  code: 'console.log("hello world")',
  children: [],
}, {
  type: 'paragraph',
  children: [{
    text: '这是一个 demo'
  }]
},];


const App = () => {
  const [editor] = useState(() => withReact(createEditor()));
  const [initValue] = useState(() => {
    const content = localStorage.getItem('content');
    if (content) {
      return JSON.parse(content);
    }
    return defaultValue;
  });

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
            <CodeMirror {...attributes} {...element} onChange={(code) => { setCode(code) }} />
          </div>
        )
      default:
        return <p {...attributes}>{children}</p>
    }
  }

  const save = (value: Descendant[]) => {
    localStorage.setItem('content', JSON.stringify(value));
  }

  return (
    <div style={{ maxWidth: 700, margin: '50px auto' }}>
      <Slate editor={editor} value={initValue} onChange={save} >
        <Editable
          renderElement={renderElement}
        />
      </Slate>
    </div>
  )
}

export default App;