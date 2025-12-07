import { RenderElementProps } from "slate-react";
import type { AnnotationElement } from "../../types";

import blockPanelItems from "./block-panel-items/index";
import hotkeys from "./hotkeys/index";
import Annotation from "./components/Annotation/index.tsx";
import {
  createInlineElementPlugin,
  createVoidElementPlugin,
} from "../../utils";

import Base from "../base";
import IExtension from "../types";

class AnnotationExtension extends Base implements IExtension {
  type = "annotation";

  override getPlugins() {
    return [
      createInlineElementPlugin(this.type),
      createVoidElementPlugin(this.type),
    ];
  }

  override getHotkeyConfigs() {
    return hotkeys;
  }

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return (
      <Annotation
        element={element as AnnotationElement}
        attributes={attributes}
      >
        {children}
      </Annotation>
    );
  }
}

export default AnnotationExtension;
