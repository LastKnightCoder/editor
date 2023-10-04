import { RenderElementProps } from "slate-react";
import { CalloutElement } from "@/components/Editor/types";

import blockPanelItems from "./blockPanelItems";
import Callout from "./components/Callout";
import { deleteFirstLineCallout } from './plugins';

import Base from '../base.ts';
import IExtension from "../types.ts";

class CalloutExtension extends Base implements IExtension {
  type = 'callout';

  override getPlugins() {
    return [deleteFirstLineCallout];
  }

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return <Callout element={element as CalloutElement} attributes={attributes}>{children}</Callout>;
  }
}

export default CalloutExtension;
