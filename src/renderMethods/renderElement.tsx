import {Editor, Transforms} from "slate";
import {ReactEditor, RenderElementProps} from "slate-react";
import {Editor as CodeMirrorEditor} from "codemirror";
import {CodeBlockElement} from "../custom-types";
import CodeBlock from "../components/CodeBlock";
import Callout from "../components/Callout";
import Header from "../components/Header";
import Image from "../components/Image";
import Detail from "../components/Detail";

export const renderElement = (editor: Editor) => {
  return (props: RenderElementProps) => {
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
      case 'image':
        return (
          <Image attributes={attributes} element={element}>
            {children}
          </Image>
        )
      case 'detail':
        return (
          <Detail attributes={attributes} element={element}>
            {children}
          </Detail>
        )
      default:
        return <p {...attributes}>{children}</p>
    }
  }
}