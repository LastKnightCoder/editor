import { RenderElementProps } from "slate-react";
import Paragraph from "@/components/Editor/components/Paragraph";
import {ParagraphElement} from "@/components/Editor/types";

import { withParagraph } from "./plugins";
import IExtension from "../types.ts";

export class ParagraphExtension implements IExtension {
  type = 'paragraph';
  getPlugins = () => {
    return [withParagraph];
  };
  render = (props: RenderElementProps) => {
    const { element, attributes, children } = props;
    return <Paragraph element={element as ParagraphElement} attributes={attributes}>{children}</Paragraph>;
  };
  getHotkeyConfig = () => [];
}