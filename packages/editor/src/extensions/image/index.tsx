import { RenderElementProps } from "slate-react";
import type { ImageElement } from "../../types";

import Image from "./components/Image";
import { pasteImage, overwrite } from "./plugins";
import blockPanelItems from "./block-panel-items";
import { createBlockElementPlugin, createVoidElementPlugin } from "../../utils";

import IExtension from "../types";
import Base from "../base";

export const imageActionsMap = new WeakMap<
  ImageElement,
  {
    showOverview: () => void;
    deleteImage: () => void;
    startCrop: () => void;
    showDescEditor: () => void;
    getImageBlob: () => Promise<Blob | null>;
  }
>();

class ImageExtension extends Base implements IExtension {
  type = "image";

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override getPlugins() {
    return [
      overwrite,
      pasteImage,
      createBlockElementPlugin(this.type),
      createVoidElementPlugin(this.type),
    ];
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return (
      <Image element={element as ImageElement} attributes={attributes}>
        {children}
      </Image>
    );
  }
}

export default ImageExtension;
