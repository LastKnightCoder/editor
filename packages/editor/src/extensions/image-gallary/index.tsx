import { defineElement, defineExtension, type ElementRenderProps } from "../../api";

import ImageGallery from "./components/ImageGallery";
import type { ImageExtensionOptions } from "../image/appearanceOption";
import type { ImageGalleryElement } from "../../types";

import blockPanelItems from "./block-panel-items";
import { imageGalleryCommands, imageGalleryMenuItems } from "./utils/menu";

export const createImageGalleryExtension = (options: ImageExtensionOptions = {}) =>
  defineExtension({
    id: "tau.image-gallery",
    elements: [
      defineElement<ImageGalleryElement>({
        type: "image-gallery",
        kind: "block",
        isVoid: true,
        render: ({ attributes, element, children }: ElementRenderProps<ImageGalleryElement>) => (
          <ImageGallery attributes={attributes} element={element} appearance={options.appearance}>
            {children}
          </ImageGallery>
        ),
        drag: true,
      }),
    ],
    blockPanel: blockPanelItems,
    commands: imageGalleryCommands,
    menu: imageGalleryMenuItems,
  });

const imageGalleryExtension = createImageGalleryExtension();
export default imageGalleryExtension;
