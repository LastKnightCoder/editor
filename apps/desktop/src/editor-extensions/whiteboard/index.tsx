import { whiteboardElementDefinition } from "../entity-definitions";
import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor";
import Whiteboard from "./components/Whiteboard";
import { withSetting } from "./plugins";
import blockPanelItems from "./block-panel-items";
import type { WhiteboardElement } from "./types";
export type { WhiteboardElement } from "./types";

const whiteboardExtension = defineExtension({
  id: "host.whiteboard",
  elements: [
    defineElement<WhiteboardElement>({
      ...whiteboardElementDefinition,
      render: ({ attributes, element, children }: ElementRenderProps<WhiteboardElement>) => (
        <Whiteboard attributes={attributes} element={element}>
          {children}
        </Whiteboard>
      ),
      drag: true,
    }),
  ],
  blockPanel: blockPanelItems,
  // 白板删除/插入的引用计数走 apply（编辑器级方法），保留为受信任层插件
  plugins: [withSetting],
});

export default whiteboardExtension;
