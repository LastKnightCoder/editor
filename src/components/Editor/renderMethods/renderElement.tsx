import { RenderElementProps } from "slate-react";

import loadable from "@loadable/component";
import Table from "../components/Table";
import TableRow from "../components/TableRow";
import TableCell from "../components/TableCell";
import CheckList from "../components/CheckList";
import CheckListItem from "../components/CheckListItem";
import HTMLBlock from "../components/HTMLBlock";
import Graphviz from "../components/Graphviz";
import Paragraph from "../components/Paragraph";

const CustomBlock = loadable(() => import("../components/CustomBlock"));
const Tikz = loadable(() => import("../components/Tikz"));


export const renderElement = () => {
  return (props: RenderElementProps) => {
    const { attributes, children, element } = props;

    switch (element.type) {
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
      case 'paragraph':
      default:
        return <Paragraph element={element as any} attributes={attributes}>{children}</Paragraph>
    }
  }
}