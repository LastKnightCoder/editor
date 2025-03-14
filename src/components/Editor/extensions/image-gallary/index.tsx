import { Element } from "slate";
import { RenderElementProps } from "slate-react";
import ImageGallery from "./components/ImageGallery";
import Base from "@/components/Editor/extensions/base.ts";
import IExtension from "@/components/Editor/extensions/types.ts";
import { ImageGalleryElement } from "@/components/Editor/types";

import blockPanelItems from "./block-panel-items";

class ImageGalleryExtension extends Base implements IExtension {
  type = "image-gallery";

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override toMarkdown(element: Element): string {
    const { images } = element as ImageGalleryElement;

    return images.map((image) => `![](${image.url})`).join("\n");
  }

  render(props: RenderElementProps) {
    const { attributes, element, children } = props;

    return (
      <ImageGallery
        attributes={attributes}
        element={element as ImageGalleryElement}
      >
        {children}
      </ImageGallery>
    );
  }
}

export default ImageGalleryExtension;
