import { Element } from "slate";
import { RenderElementProps } from "slate-react";
import { DetailElement } from "@/components/Editor/types";

import Detail from "./components/Detail";
import { deleteBackward, quit, withNormalize } from "./plugins";
import blockPanelItems from "./block-panel-items";
import { createBlockElementPlugin } from "../../utils";

import Base from "../base.ts";
import IExtension from "../types.ts";

class DetailExtension extends Base implements IExtension {
  type = "detail";
  override getPlugins() {
    return [
      deleteBackward,
      quit,
      withNormalize,
      createBlockElementPlugin(this.type),
    ];
  }

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  toMarkdown(element: Element, children: string): string {
    const detailEle = element as unknown as DetailElement;
    const { title } = detailEle;

    return `::: detail ${title}\n${children}\n:::`;
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return (
      <Detail element={element as DetailElement} attributes={attributes}>
        {children}
      </Detail>
    );
  }
}

export default DetailExtension;
