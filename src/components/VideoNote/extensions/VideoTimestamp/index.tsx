import { Element } from "slate";
import { VideoController } from "../../VideoController";
import IExtension from "@/components/Editor/extensions/types";
import { IHotKeyConfig } from "@/components/Editor/types";
import VideoTimestamp from "./components/VideoTimestamp";
import { createInlineElementPlugin } from "../../plugins";
import { createTimestampHotkey } from "../../hotkeys";

class VideoTimestampExtension implements IExtension {
  type = "video-timestamp";

  constructor(private videoController: VideoController) {}

  getPlugins() {
    return [createInlineElementPlugin(this.type)];
  }

  getHotkeyConfigs(): IHotKeyConfig[] {
    return [createTimestampHotkey(this.videoController)];
  }

  render(props: any) {
    return <VideoTimestamp {...props} onSeek={this.videoController.seekTo} />;
  }

  getBlockPanelItems() {
    return [];
  }

  getHoveringBarElements() {
    return [];
  }

  toMarkdown(node: Element) {
    const text = (node.children as any[]).map((child) => child.text).join("");
    return `[${text}](时间戳:${(node as any).time})`;
  }
}

export default VideoTimestampExtension;
