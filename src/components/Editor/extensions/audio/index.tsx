import Base from "../base.ts";
import IExtension from "../types.ts";
import { AudioElement, CustomElement } from "@/components/Editor/types";
import { RenderElementProps } from "slate-react";
import Audio from "./components/Audio";
import { pasteAudio } from "./plugins";
import blockPanelItems from "./block-panel-items";

class AudioExtension extends Base implements IExtension {
  type = "audio";

  override getPlugins() {
    return [pasteAudio];
  }

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override toMarkdown(element: CustomElement): string {
    const { src } = element as AudioElement;
    return `<audio src="${src}" controls></audio>`;
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
