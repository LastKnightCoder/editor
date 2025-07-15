import Base from "../base.ts";
import IExtension from "../types.ts";
import { AudioElement } from "@/components/Editor/types";
import { RenderElementProps } from "slate-react";
import Audio from "./components/Audio";
import { pasteAudio } from "./plugins";
import blockPanelItems from "./block-panel-items";
import { createBlockElementPlugin, createVoidElementPlugin } from "../../utils";

class AudioExtension extends Base implements IExtension {
  type = "audio";

  override getPlugins() {
    return [
      pasteAudio,
      createVoidElementPlugin(this.type),
      createBlockElementPlugin(this.type),
    ];
  }

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return (
      <Audio element={element as AudioElement} attributes={attributes}>
        {children}
      </Audio>
    );
  }
}

export default AudioExtension;
