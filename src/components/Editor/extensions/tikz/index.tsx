import { RenderElementProps } from "slate-react";

import loadable from "@loadable/component";
import { TikzElement } from "@/components/Editor/types";

import Base from '../base.ts';
import IExtension from "../types.ts";

import blockPanelItems from './block-panel-items';

const Tikz = loadable(() => import("./components/Tikz"));

class TikzExtension extends Base implements IExtension {
  type = 'tikz';

  override getBlockPanelItems() {
    return blockPanelItems;
  }
  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return <Tikz element={element as TikzElement} attributes={attributes}>{children}</Tikz>;
  }
}

export default TikzExtension;