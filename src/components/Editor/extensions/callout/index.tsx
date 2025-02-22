import { Element } from 'slate';
import { RenderElementProps } from "slate-react";
import { CalloutElement } from "@/components/Editor/types";

import blockPanelItems from "./blockPanelItems";
import Callout from "./components/Callout";
import { DEFAULT_TITLE } from "./constants.ts";
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
    const { calloutType } = calloutEle;

    return `:::${calloutType}{title=${calloutEle.title || DEFAULT_TITLE[calloutType]}}\n${children}:::`;
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return <Callout element={element as CalloutElement} attributes={attributes}>{children}</Callout>;
  }
}

export default CalloutExtension;
