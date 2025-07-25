import { RenderElementProps } from "slate-react";
import { EmojiElement } from "@/components/Editor/types";
import {
  createInlineElementPlugin,
  createVoidElementPlugin,
} from "../../utils";
import IExtension from "../types.ts";
import Base from "../base.ts";
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
