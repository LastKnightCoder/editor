import { RenderElementProps } from "slate-react";
import { ImageElement } from "@/components/Editor/types";

import Image from './components/Image';
import { pasteImage } from "./plugins";
import blockPanelItems from './block-panel-items';

import IExtension from "../types.ts";
import Base from '../base.ts';

class ImageExtension extends Base implements IExtension {
  type = 'image';

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override getPlugins() {
    return [pasteImage];
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return <Image element={element as ImageElement} attributes={attributes}>{children}</Image>;
  }
}

export default ImageExtension;