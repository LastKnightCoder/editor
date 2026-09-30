import type { Editor } from "slate";

import { defineElement, defineExtension, type ElementRenderProps } from "../../api";

import type { ImageElement } from "../../types";

import Image from "./components/Image";
import blockPanelItems from "./block-panel-items";
import { buildImageMenuItems, imageCommands, imageMediaActionEntries } from "./utils/menu";
import { imageIngestSpec } from "./ingest";
import { readImageAppearance, type ImageExtensionOptions } from "./appearanceOption";

export const createImageExtension = (options: ImageExtensionOptions = {}) =>
  defineExtension({
    id: "tau.image",
    elements: [
      defineElement<ImageElement>({
        type: "image",
        kind: "block",
        isVoid: true,
        render: ({ attributes, element, children }: ElementRenderProps<ImageElement>) => (
          <Image element={element} attributes={attributes} appearance={options.appearance}>
            {children}
          </Image>
        ),
        drag: true,
        // 拖入 / 粘贴图片文件的认领（01 §5.4 ingest，含非空段落的行内图落位）
        ingest: imageIngestSpec,
      }),
    ],
    blockPanel: blockPanelItems,
    commands: imageCommands,
    /** appearance（圆角/阴影的全局默认值）随扩展实例注入菜单工厂 */
    menu: (editor: Editor) => [
      ...imageMediaActionEntries(editor),
      ...buildImageMenuItems(readImageAppearance(options.appearance)),
    ],
  });

const imageExtension = createImageExtension();
export default imageExtension;
