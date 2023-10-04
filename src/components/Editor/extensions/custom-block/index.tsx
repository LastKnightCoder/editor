import loadable from "@loadable/component";
import { CustomBlockElement } from "@/components/Editor/types";

import { RenderElementProps } from "slate-react";

import Base from '../base.ts';
import IExtension from "../types.ts";

import blockPanelItems from './block-panel-items';

const CustomBlock = loadable(() => import("./components/CustomBlock"));

class CustomBlockExtension extends Base implements IExtension {
  type = 'custom-block';

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return <CustomBlock element={element as CustomBlockElement} attributes={attributes}>{children}</CustomBlock>;
  }
}

export default CustomBlockExtension;