import { Element } from 'slate';
import { RenderElementProps } from "slate-react";
import { CalloutElement } from "@/components/Editor/types";

import blockPanelItems from "./blockPanelItems";
import Callout from "./components/Callout";
import { deleteFirstLineCallout, quit, withNormalize } from './plugins';

import Base from '../base.ts';
import IExtension from "../types.ts";

class CalloutExtension extends Base implements IExtension {
  type = 'callout';

  override getPlugins() {
    return [deleteFirstLineCallout, quit, withNormalize];
  }

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override toMarkdown(element: Element, children: string): string {
    const calloutEle = element as unknown as CalloutElement;
    const { type, title } = calloutEle;

    return `::: ${type} ${title}\n${children}\n:::`;
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return <Callout element={element as CalloutElement} attributes={attributes}>{children}</Callout>;
  }
}

export default CalloutExtension;
