import HTMLBlock from '@/components/Editor/components/HTMLBlock';
import { HTMLBlockElement } from "@/components/Editor/types";

import { RenderElementProps } from "slate-react";

import Base from '../base.ts';
import IExtension from "../types.ts";

class HtmlBlockExtension extends Base implements IExtension {
  type = 'html-block';

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return <HTMLBlock element={element as HTMLBlockElement} attributes={attributes}>{children}</HTMLBlock>;
  }
}

export default HtmlBlockExtension;
