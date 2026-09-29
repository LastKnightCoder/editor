import Base from "../base";
import IExtension from "../types";
import type { AudioElement } from "../../types";
import { RenderElementProps } from "slate-react";
import Audio from "./components/Audio";
import { pasteAudio, dropAudio } from "./plugins";
import blockPanelItems from "./block-panel-items";
import type { Editor } from "slate";
import { createBlockElementPlugin, createVoidElementPlugin } from "../../utils";

class AudioExtension extends Base implements IExtension {
  type = "audio";

  override dragSpec = true;

  override getPlugins() {
    return [
      pasteAudio,
      dropAudio,
      createVoidElementPlugin(this.type),
      createBlockElementPlugin(this.type),
    ];
  }

  override getBlockPanelItems(editor?: Editor) {
    return blockPanelItems(editor);
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
