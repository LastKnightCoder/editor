import { RenderElementProps } from "slate-react";

import type { HeaderElement } from "../../types";

import Base from "../base";
import IExtension from "../types";

import Header from "./components/Header";
import { insertBreak, deleteBackward, markdownSyntax } from "./plugins";
import headerHotKeys from "./hotkeys";
import blockPanelItems from "./blockPanelItems";
import { createBlockElementPlugin } from "../../utils";
class HeaderExtension extends Base implements IExtension {
  type = "header";
  override getPlugins() {
    return [
      insertBreak,
      deleteBackward,
      markdownSyntax,
      createBlockElementPlugin(this.type),
    ];
  }

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return (
      <Header element={element as HeaderElement} attributes={attributes}>
        {children}
      </Header>
    );
  }
  override getHotkeyConfigs() {
    return headerHotKeys;
  }
}

export default HeaderExtension;
