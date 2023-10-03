import { RenderElementProps } from "slate-react";

import loadable from "@loadable/component";
import HTMLBlock from "../components/HTMLBlock";
import Graphviz from "../components/Graphviz";
import Paragraph from "../components/Paragraph";

const CustomBlock = loadable(() => import("../components/CustomBlock"));
const Tikz = loadable(() => import("../components/Tikz"));


export const renderElement = () => {
  return (props: RenderElementProps) => {
    const { attributes, children, element } = props;

    switch (element.type) {
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