import { Element } from 'slate';
import { RenderElementProps } from "slate-react";

import { HeaderElement } from "@/components/Editor/types";

import Base from '../base.ts';
import IExtension from "../types.ts";

import Header from './components/Header';
import { insertBreak, deleteBackward, markdownSyntax } from "./plugins";
import headerHotKeys from "./hotkeys";
import blockPanelItems from './blockPanelItems';

class HeaderExtension extends Base implements IExtension {
  type = 'header';
  override getPlugins() {
    return [insertBreak, deleteBackward, markdownSyntax];
  }

  override getBlockPanelItems() {
    return blockPanelItems;
  }
  override toMarkdown(element: Element, children: string): string {
    const headerEle = element as unknown as HeaderElement;
    const { level } = headerEle;
    return `${'#'.repeat(level)} ${children}\n`;
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return <Header element={element as HeaderElement} attributes={attributes}>{children}</Header>;
  }
  override getHotkeyConfigs() {
    return headerHotKeys;
  }
}

export default HeaderExtension;