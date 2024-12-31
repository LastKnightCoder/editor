import { Descendant } from "slate";
import Base from "@/components/Editor/extensions/base.ts";
import IExtension from "@/components/Editor/extensions/types.ts";

import DailySummary from "./components/DailySummary";
import { overwrite } from './plugins';
import blockPanelItems from "./block-panel-items";
import { RenderElementProps } from "slate-react";

export interface DailySummaryElement {
  type: 'daily-summary';
  date: string;
  children: Descendant[];
}

class DailySummaryExtension extends Base implements IExtension {
  type = 'daily-summary';

  override getPlugins() {
    return [overwrite]
  }

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;

    return (
      <DailySummary element={element as any as DailySummaryElement} attributes={attributes}>
        {children}
      </DailySummary>
    )
  }
}

export default DailySummaryExtension;
