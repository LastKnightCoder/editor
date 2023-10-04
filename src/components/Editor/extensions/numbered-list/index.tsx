import { RenderElementProps } from "slate-react";
import { NumberedListElement } from "@/components/Editor/types";

import NumberedList from "./components/NumberedList";
import { markdownSyntax } from './plugins';
import blockPanelItems from './block-panel-items';

import Base from '../base.ts';
import IExtension from "../types.ts";

class NumberedListExtension extends Base implements IExtension {
  type = 'numbered-list';
  override getPlugins() {
    return [markdownSyntax];
  }

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return <NumberedList element={element as NumberedListElement} attributes={attributes}>{children}</NumberedList>;
  }
}

export default NumberedListExtension;