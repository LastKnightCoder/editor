import Base from "../base";
import IExtension from "../types";
import type { AudioElement } from "../../types";
import { RenderElementProps } from "slate-react";
import Audio from "./components/Audio";
import { audioIngestSpec } from "./ingest";
import blockPanelItems from "./block-panel-items";
import type { Editor } from "slate";
import { createBlockElementPlugin, createVoidElementPlugin } from "../../utils";

class AudioExtension extends Base implements IExtension {
  type = "audio";

  override dragSpec = true;
  override ingestSpec = audioIngestSpec;

  override getPlugins() {
    return [createVoidElementPlugin(this.type), createBlockElementPlugin(this.type)];
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
