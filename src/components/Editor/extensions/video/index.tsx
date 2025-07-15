import { RenderElementProps } from "slate-react";
import Base from "../base";
import IExtension from "../types";
import { VideoElement } from "../../types";

import VideoComponent from "./components/VideoComponent";
import { pasteVideo } from "./plugins";
import blockPanelItems from "./block-panel-items";
import { createVoidElementPlugin, createBlockElementPlugin } from "../../utils";
class VideoExtension extends Base implements IExtension {
  type = "video";

  override getPlugins() {
    return [
      pasteVideo,
      createBlockElementPlugin(this.type),
      createVoidElementPlugin(this.type),
    ];
  }

  override getBlockPanelItems() {
    return blockPanelItems;
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
