import { RenderElementProps } from "slate-react";
import { BulletedListElement } from "@/components/Editor/types";

import BulletedList from "./components/BulletedList";
import { markdownSyntax, withNormalize } from './plugins';
import blockPanelItems from './block-panle-items';

import Base from '../base.ts';
import IExtension from "../types.ts";

class BulletedListExtension extends Base implements IExtension {
  type = 'bulleted-list';
  
  override getPlugins() {
    return [markdownSyntax, withNormalize];
  }

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return <BulletedList element={element as BulletedListElement} attributes={attributes}>{children}</BulletedList>;
  }
}

export default BulletedListExtension;
