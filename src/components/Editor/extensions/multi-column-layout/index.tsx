import { Element } from "slate";
import { RenderElementProps } from "slate-react";
import Base from "@/components/Editor/extensions/base.ts";

import IExtension from "@/components/Editor/extensions/types.ts";
import {
  MultiColumnContainerElement,
  MultiColumnItemElement,
} from "@/components/Editor/types";

import MultiColumnsContainer from "./components/MultiColumnsContainer";
import MultiColumnItem from "./components/MultiColumnItem";

import hotkeys from "./hotkeys";
import blockPanelItems from "./block-panel-items";
import {
  normalizeColumnLayout,
  deleteBackward,
  normalizeItem,
} from "./plugins";
import { createBlockElementPlugin } from "../../utils";

export class MultiColumnsContainerExtension extends Base implements IExtension {
  type = "multi-column-container";

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override getPlugins() {
    return [normalizeColumnLayout, createBlockElementPlugin(this.type)];
  }

  override toMarkdown(_element: Element, children: string): string {
    return children;
  }

  render(props: RenderElementProps) {
    const { attributes, element, children } = props;

    return (
      <MultiColumnsContainer
        attributes={attributes}
        element={element as MultiColumnContainerElement}
      >
        {children}
      </MultiColumnsContainer>
    );
  }
}

export class MultiColumnItemExtension extends Base implements IExtension {
  type = "multi-column-item";

  override getHotkeyConfigs() {
    return hotkeys;
  }

  override getPlugins() {
    return [deleteBackward, normalizeItem, createBlockElementPlugin(this.type)];
  }

  override toMarkdown(_element: Element, children: string): string {
    return children + "\n";
  }

  render(props: RenderElementProps) {
    const { attributes, element, children } = props;

    return (
      <MultiColumnItem
        attributes={attributes}
        element={element as MultiColumnItemElement}
      >
        {children}
      </MultiColumnItem>
    );
  }
}
