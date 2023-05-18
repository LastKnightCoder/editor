import { Editor, Transforms } from "slate";
import { ReactEditor, RenderElementProps } from "slate-react";
import { Editor as CodeMirrorEditor } from "codemirror";

import { CodeBlockElement } from "../custom-types";

import CodeBlock from "../components/CodeBlock";
import Callout from "../components/Callout";
import Header from "../components/Header";
import Image from "../components/Image";
import Detail from "../components/Detail";
import Blockquote from "../components/Blockquote";
import Link from "../components/Link";
import Table from "../components/Table";
import TableRow from "../components/TableRow";
import TableCell from "../components/TableCell";
import InlineMath from "../components/InlineMath";
import BlockMath from "../components/BlockMath";
import BulletedList from "../components/BulletedList";
import NumberedList from "../components/NumberedList";
import CheckList from "../components/CheckList";
import CheckListItem from "../components/CheckListItem";

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
          <BulletedList element={element} attributes={attributes}>
            {children}
          </BulletedList>
        )
      case 'numbered-list':
        return (
          <NumberedList element={element} attributes={attributes}>
            {children}
          </NumberedList>
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
      case 'blockquote':
        return (
          <Blockquote attributes={attributes} element={element}>
            {children}
          </Blockquote>
        )
      case 'link':
        return (
          <Link element={element} attributes={attributes} >
            {children}
          </Link>
        )
      case 'table':
        return (
          <Table element={element} attributes={attributes} >
            {children}
          </Table>
        )
      case 'table-row':
        return (
          <TableRow attributes={attributes} element={element}>
            {children}
          </TableRow>
        )
      case 'table-cell':
        return (
          <TableCell attributes={attributes} element={element}>
            {children}
          </TableCell>
        )
      case "inline-math":
        return (
          <InlineMath attributes={attributes} element={element}>
            {children}
          </InlineMath>
        )
      case 'block-math':
        return (
          <BlockMath attributes={attributes} element={element}>
            {children}
          </BlockMath>
        )
      case 'check-list':
        return (
          <CheckList attributes={attributes} element={element}>
            {children}
          </CheckList>
        )
      case 'check-list-item':
        return (
          <CheckListItem attributes={attributes} element={element}>
            {children}
          </CheckListItem>
        )
      default:
        return <p {...attributes}>{children}</p>
    }
  }
}