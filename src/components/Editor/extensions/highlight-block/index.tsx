import { Element } from 'slate';
import { RenderElementProps } from "slate-react";

import HighlightBlock from "./components/HighlightBlock";
import Base from "@/components/Editor/extensions/base.ts";
import IExtension from "@/components/Editor/extensions/types.ts";
import { HighlightBlockElement } from "@/components/Editor/types";

import blockPanelItems from './block-panel-items';
import { quit, withNormalize } from './plugins';

class HighlightBlockExtension extends Base implements IExtension {
  type = 'highlight-block';

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override getPlugins() {
    return [quit, withNormalize];
  }

  override toMarkdown(_element: Element, children: string): string {
    return `\`\`\`highlight-block\n${children}\n\`\`\`\n`;
  }

  render(props: RenderElementProps) {
    const { attributes, element, children } = props;

    return (
      <HighlightBlock attributes={attributes} element={element as HighlightBlockElement}>
        {children}
      </HighlightBlock>
    )
  }
}

export default HighlightBlockExtension;