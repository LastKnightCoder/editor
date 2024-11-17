import { RenderElementProps } from "slate-react";
import Base from "../base";
import IExtension from "../types";
import { VideoElement } from "../../types";

import VideoComponent from './components/VideoComponent';
import { pasteVideo } from './plugins';
import blockPanelItems from './block-panel-items';
import { Element } from "slate";

class VideoExtension extends Base implements IExtension {
  type = 'video';

  override getPlugins() {
    return [pasteVideo];
  }

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  toMarkdown(element: Element): string {
    const { src } = element as VideoElement;
    return `<video src=${src} controls></video>`
  }

  render(props: RenderElementProps) {
    const { element, children, attributes } = props;

    return (
      <VideoComponent element={element as VideoElement} attributes={attributes}>{children}</VideoComponent>
    )
  }
}

export default VideoExtension;
