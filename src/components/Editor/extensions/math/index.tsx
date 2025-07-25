import { RenderElementProps } from "slate-react";
import { InlineMathElement, BlockMathElement } from "@/components/Editor/types";
import InlineMath from "./components/InlineMath";
import BlockMath from "./components/BlockMath";

import Base from "../base";
import IExtension from "../types.ts";
import {
  createBlockElementPlugin,
  createInlineElementPlugin,
  createVoidElementPlugin,
} from "../../utils";

import { inlineShortcut, blockShortcut } from "./hotkeys";
import blockPanelItems from "./block-panel-items";
import hoveringBarConfigs from "./hovering-bar-configs";

export class InlineMathExtension extends Base implements IExtension {
  type = "inline-math";

  override getHotkeyConfigs() {
    return [...inlineShortcut];
  }

  override getHoveringBarElements() {
    return hoveringBarConfigs;
  }

  override getPlugins() {
    return [
      createInlineElementPlugin(this.type),
      createVoidElementPlugin(this.type),
    ];
  }

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return (
      <InlineMath
        attributes={attributes}
        element={element as InlineMathElement}
      >
        {children}
      </InlineMath>
    );
  }
}

export class BlockMathExtension extends Base {
  type = "block-math";

  override getPlugins() {
    return [
      createBlockElementPlugin(this.type),
      createVoidElementPlugin(this.type),
    ];
  }

  override getHotkeyConfigs() {
    return [...blockShortcut];
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return (
      <BlockMath attributes={attributes} element={element as BlockMathElement}>
        {children}
      </BlockMath>
    );
  }
}
