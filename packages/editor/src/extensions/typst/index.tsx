import { RenderElementProps } from "slate-react";

import loadable from "@loadable/component";
import type { TypstElement } from "../../types";

import Base from "../base";
import IExtension from "../types";
import { createBlockElementPlugin, createVoidElementPlugin } from "../../utils";
import blockPanelItems from "./block-panel-items";

const Typst = loadable(() => import("./components/Typst"));

class TypstExtension extends Base implements IExtension {
  type = "typst";

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override getPlugins() {
    return [
      createBlockElementPlugin(this.type),
      createVoidElementPlugin(this.type),
    ];
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return (
      <Typst element={element as TypstElement} attributes={attributes}>
        {children}
      </Typst>
    );
  }
}

export default TypstExtension;
