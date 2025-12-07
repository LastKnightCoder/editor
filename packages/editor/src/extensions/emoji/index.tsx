import { RenderElementProps } from "slate-react";
import type { EmojiElement } from "../../types";
import {
  createInlineElementPlugin,
  createVoidElementPlugin,
} from "../../utils";
import IExtension from "../types";
import Base from "../base";
import Emoji from "./components/Emoji";
import blockPanelItems from "./block-panel-items";

class EmojiExtension extends Base implements IExtension {
  type = "emoji";

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override getPlugins() {
    return [
      createInlineElementPlugin(this.type),
      createVoidElementPlugin(this.type),
    ];
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return (
      <Emoji element={element as EmojiElement} attributes={attributes}>
        {children}
      </Emoji>
    );
  }
}

export default EmojiExtension;
