import { useState } from "react";
import CodeMirror from "./components/CodeBlock";
import Highlight from "./components/Highlight";
import {createEditor, Descendant, Transforms} from 'slate';
import {Slate, Editable, withReact, RenderElementProps, ReactEditor, RenderLeafProps} from 'slate-react';


const defaultValue = [{
  type: 'paragraph',
  children: [{
    text: '这是一个 demo'
  }]
}, {
  type: 'code-block',
  language: 'javascript',
  code: 'console.log("hello world")',
  children: [
    { text: '' }
  ]
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
  }

  return (
    <div style={{ maxWidth: 700, margin: '50px auto' }}>
      <Slate editor={editor} value={initValue} onChange={save} >
        <Editable
          renderElement={renderElement}
          renderLeaf={renderLeaf}
        />
      </Slate>
    </div>
  )
}

export default App;