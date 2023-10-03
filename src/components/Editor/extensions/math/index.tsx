import { RenderElementProps } from "slate-react";
import { InlineMathElement, BlockMathElement } from "@/components/Editor/types";
import InlineMath from '@/components/Editor/components/InlineMath';
import BlockMath from '@/components/Editor/components/BlockMath';

import Base from '../base';
import IExtension from "../types.ts";
import { inlineShortcut, blockShortcut } from './hotkeys';

export class InlineMathExtension extends Base implements IExtension {
  type = 'inline-math';
  override getHotkeyConfigs() {
    return [...inlineShortcut];
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return (
      <InlineMath attributes={attributes} element={element as InlineMathElement}>
        {children}
      </InlineMath>
    )
  }
}

export class BlockMathExtension extends Base{
  type = 'block-math';
  override getHotkeyConfigs() {
    return [...blockShortcut];
  }
  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return (
      <BlockMath attributes={attributes} element={element as BlockMathElement}>
        {children}
      </BlockMath>
    )
  }
}