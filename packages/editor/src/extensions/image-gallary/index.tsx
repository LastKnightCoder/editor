import { RenderElementProps } from "slate-react";
import ImageGallery from "./components/ImageGallery";
import Base from "../base";
import IExtension from "../types";
import type { ImageExtensionOptions } from "../image/appearanceOption";
import type { ImageGalleryElement } from "../../types";

import blockPanelItems from "./block-panel-items";
import { createBlockElementPlugin, createVoidElementPlugin } from "../../utils";
import { imageGalleryCommands, imageGalleryMenuItems } from "./utils/menu";

class ImageGalleryExtension extends Base implements IExtension {
  type = "image-gallery";

  private readonly options: ImageExtensionOptions;

  constructor(options: ImageExtensionOptions = {}) {
    super();
    this.options = options;
  }

  override commands = imageGalleryCommands;
  override menuItems = imageGalleryMenuItems;
  override dragSpec = true;

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override getPlugins() {
    return [createBlockElementPlugin(this.type), createVoidElementPlugin(this.type)];
  }

  render(props: RenderElementProps) {
    const { attributes, element, children } = props;

    return (
      <ImageGallery
        attributes={attributes}
        element={element as ImageGalleryElement}
        appearance={this.options.appearance}
      >
        {children}
      </ImageGallery>
    );
  }
}

export default ImageGalleryExtension;
