import { RenderElementProps } from "slate-react";
import Paragraph from "@/components/Editor/components/Paragraph";
import {ParagraphElement} from "@/components/Editor/types";

import Base from '../base';
import IExtension from "../types";
import { inlineCode } from "./plugins";

class ParagraphExtension extends Base implements IExtension {
  override type = 'paragraph';

  override getPlugins() {
    return [inlineCode]
  }
  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return <Paragraph element={element as ParagraphElement} attributes={attributes}>{children}</Paragraph>;
  }
}

export default ParagraphExtension;