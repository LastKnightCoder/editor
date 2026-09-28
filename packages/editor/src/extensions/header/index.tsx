import { RenderElementProps } from "slate-react";

import type { HeaderElement } from "../../types";

import Base from "../base";
import IExtension from "../types";

import Header from "./components/Header";
import { insertBreak, deleteBackward, markdownSyntax } from "./plugins";
import headerHotKeys from "./hotkeys";
import blockPanelItems from "./blockPanelItems";
import { createBlockElementPlugin } from "../../utils";

export interface HeaderExtensionOptions {
  /** 禁用标题折叠：不显示折叠按钮，已折叠的标题按展开渲染 */
  disableCollapse?: boolean;
}

class HeaderExtension extends Base implements IExtension {
  type = "header";

  private readonly options: HeaderExtensionOptions;

  constructor(options: HeaderExtensionOptions = {}) {
    super();
    this.options = options;
  }

  override getPlugins() {
    return [insertBreak, deleteBackward, markdownSyntax, createBlockElementPlugin(this.type)];
  }

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return (
      <Header
        element={element as HeaderElement}
        attributes={attributes}
        disableCollapse={this.options.disableCollapse}
      >
        {children}
      </Header>
    );
  }
  override getHotkeyConfigs() {
    return headerHotKeys;
  }
}

export default HeaderExtension;
