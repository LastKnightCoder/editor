import type { Element } from "slate";
import { RenderElementProps } from "slate-react";
import { cn } from "@tau/ui";

import type { HeaderElement } from "../../types";

import Base from "../base";
import IExtension from "../types";

import Header from "./components/Header";
import { LEVEL_FONT_SIZE } from "./components/Header/components";
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

  /**
   * 手柄比通用位置更靠左更宽：让出标题折叠箭头的位置（顶线对齐由块根的级别边距保证）。
   * 手柄挂在 wrapper 上、em 按正文字号算，故补上本级字号，偏移与尺寸才以标题 em 为准、与行盒等高。
   */
  override dragSpec = {
    self: true,
    children: true,
    handleClassName: (element: Element) => {
      const { level } = element as HeaderElement;
      const normalized = level >= 1 && level <= 6 ? level : 1;
      return cn(
        "-left-[2.7em] h-[1.5em] w-[1.5em] transition-opacity duration-200 [&>svg]:translate-y-0",
        LEVEL_FONT_SIZE[normalized],
        // h1 行高收紧为 1.3
        normalized === 1 && "h-[1.3em]"
      );
    },
  };

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
