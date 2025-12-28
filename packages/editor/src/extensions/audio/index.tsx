import Base from "../base";
import IExtension from "../types";
import type { AudioElement } from "../../types";
import { RenderElementProps } from "slate-react";
import Audio from "./components/Audio";
import { pasteAudio, dropAudio, overwrite } from "./plugins";
import blockPanelItems from "./block-panel-items";
import { createBlockElementPlugin, createVoidElementPlugin } from "../../utils";

class AudioExtension extends Base implements IExtension {
  type = "audio";

  override getPlugins() {
    return [
      overwrite,
      pasteAudio,
      dropAudio,
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
