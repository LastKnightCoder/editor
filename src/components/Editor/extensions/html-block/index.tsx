import HTMLBlock from './components/HTMLBlock';
import { HTMLBlockElement } from "@/components/Editor/types";

import { RenderElementProps } from "slate-react";

import Base from '../base.ts';
import IExtension from "../types.ts";

import blockPanelItems from './block-panel-items';

class HtmlBlockExtension extends Base implements IExtension {
  type = 'html-block';

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return <HTMLBlock element={element as HTMLBlockElement} attributes={attributes}>{children}</HTMLBlock>;
  }
}

export default HtmlBlockExtension;
