import { RenderElementProps } from "slate-react";
import type { ImageElement } from "../../types";

import Image from "./components/Image";
import { pasteImage, dropImage } from "./plugins";
import blockPanelItems from "./block-panel-items";
import type { Editor } from "slate";
import { createBlockElementPlugin, createVoidElementPlugin } from "../../utils";
import { buildImageMenuItems, imageCommands, imageMediaActionEntries } from "./utils/menu";

import IExtension from "../types";
import Base from "../base";
import { readImageAppearance, type ImageExtensionOptions } from "./appearanceOption";

class ImageExtension extends Base implements IExtension {
  type = "image";

  private readonly options: ImageExtensionOptions;

  constructor(options: ImageExtensionOptions = {}) {
    super();
    this.options = options;
  }

  override commands = imageCommands;
  override dragSpec = true;
  /** appearance（圆角/阴影的全局默认值）随扩展实例注入菜单工厂 */
  override menuItems = (editor: Editor) => [
    ...imageMediaActionEntries(editor),
    ...buildImageMenuItems(readImageAppearance(this.options.appearance)),
  ];

  override getBlockPanelItems(editor?: Editor) {
    return blockPanelItems(editor);
  }

  override getPlugins() {
    return [
      pasteImage,
      dropImage,
      createBlockElementPlugin(this.type),
      createVoidElementPlugin(this.type),
    ];
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return (
      <Image
        element={element as ImageElement}
        attributes={attributes}
        appearance={this.options.appearance}
      >
        {children}
      </Image>
    );
  }
}

export default ImageExtension;
