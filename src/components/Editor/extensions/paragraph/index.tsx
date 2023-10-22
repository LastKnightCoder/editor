import { RenderElementProps } from "slate-react";
import { ParagraphElement } from "@/components/Editor/types";

import Paragraph from "./components/Paragraph";

import Base from '../base';
import IExtension from "../types";
import { inlineCode } from "./plugins";
import hoveringBarElements from "./hovering-bar-configs";

class ParagraphExtension extends Base implements IExtension {
  override type = 'paragraph';

  override getPlugins() {
    return [inlineCode]
  }
  
  override getHoveringBarElements() {
    return hoveringBarElements;
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return <Paragraph element={element as ParagraphElement} attributes={attributes}>{children}</Paragraph>;
  }
}

export default ParagraphExtension;