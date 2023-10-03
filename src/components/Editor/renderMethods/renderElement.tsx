import { RenderElementProps } from "slate-react";

import loadable from "@loadable/component";
import Blockquote from "../components/Blockquote";
import Link from "../components/Link";
import Table from "../components/Table";
import TableRow from "../components/TableRow";
import TableCell from "../components/TableCell";
import CheckList from "../components/CheckList";
import CheckListItem from "../components/CheckListItem";
import HTMLBlock from "../components/HTMLBlock";
import Graphviz from "../components/Graphviz";
import Paragraph from "../components/Paragraph";
import DivideLineElement from "../components/DivideLine";
import BlockMath from "../components/BlockMath";
import InlineMath from "../components/InlineMath";

const CustomBlock = loadable(() => import("../components/CustomBlock"));
const MermaidChart = loadable(() => import("../components/MermaidChart"));
const Tikz = loadable(() => import("../components/Tikz"));


export const renderElement = () => {
  return (props: RenderElementProps) => {
    const { attributes, children, element } = props;

    switch (element.type) {
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
      case 'mermaid':
        return (
          <MermaidChart element={element} attributes={attributes}>
            {children}
          </MermaidChart>
        )
      case 'tikz':
        return (
          <Tikz element={element} attributes={attributes}>
            {children}
          </Tikz>
        )
      case 'html-block':
        return (
          <HTMLBlock element={element} attributes={attributes}>
            {children}
          </HTMLBlock>
        )
      case 'graphviz':
        return (
          <Graphviz element={element} attributes={attributes}>
            {children}
          </Graphviz>
        )
      case 'custom-block':
        return (
          <CustomBlock element={element} attributes={attributes}>
            {children}
          </CustomBlock>
        )
      case 'divide-line':
        return (
          <DivideLineElement attributes={attributes} element={element}>
            {children}
          </DivideLineElement>
        )
      case 'paragraph':
      default:
        return <Paragraph element={element} attributes={attributes}>{children}</Paragraph>
    }
  }
}