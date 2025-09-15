import { RenderElementProps } from "slate-react";
import { AnnotationElement } from "@/components/Editor/types";

import blockPanelItems from "./block-panel-items/index.ts";
import hotkeys from "./hotkeys/index.ts";
import Annotation from "./components/Annotation/index.tsx";
import {
  createInlineElementPlugin,
  createVoidElementPlugin,
} from "../../utils";

import Base from "../base.ts";
import IExtension from "../types.ts";

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
