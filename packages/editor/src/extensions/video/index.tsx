import { RenderElementProps } from "slate-react";
import Base from "../base";
import IExtension from "../types";
import type { VideoElement } from "../../types";

import VideoComponent from "./components/VideoComponent";
import { pasteVideo, dropVideo } from "./plugins";
import blockPanelItems from "./block-panel-items";
import type { Editor } from "slate";
import { createVoidElementPlugin, createBlockElementPlugin } from "../../utils";
class VideoExtension extends Base implements IExtension {
  type = "video";

  override getPlugins() {
    return [
      pasteVideo,
      dropVideo,
      createBlockElementPlugin(this.type),
      createVoidElementPlugin(this.type),
    ];
  }

  override getBlockPanelItems(editor?: Editor) {
    return blockPanelItems(editor);
  }

  render(props: RenderElementProps) {
    const { element, children, attributes } = props;

    return (
      <VideoComponent element={element as VideoElement} attributes={attributes}>
        {children}
      </VideoComponent>
    );
  }
}

export default VideoExtension;
