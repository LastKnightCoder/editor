import { Element } from "slate";
import { VideoController } from "../../VideoController";
import IExtension from "@/components/Editor/extensions/types";
import { FormattedText, IHotKeyConfig } from "@/components/Editor/types";
import VideoScreenshot from "./components/VideoScreenshot";
import { createVoidElementPlugin } from "../../plugins";
import {
  createScreenshotHotkey,
  pauseVideoHotkey,
  playVideoHotkey,
} from "../../hotkeys";

export interface VideoScreenshotElement {
  type: "video-screenshot";
  url: string;
  time: number;
  caption: string;
  children: FormattedText[];
}

class VideoScreenshotExtension implements IExtension {
  type = "video-screenshot";

  constructor(private videoController: VideoController) {}

  getPlugins() {
    return [createVoidElementPlugin(this.type)];
  }

  getHotkeyConfigs(): IHotKeyConfig[] {
    return [
      createScreenshotHotkey(this.videoController),
      pauseVideoHotkey(this.videoController),
      playVideoHotkey(this.videoController),
    ];
  }

  render(props: any) {
    return <VideoScreenshot {...props} onSeek={this.videoController.seekTo} />;
  }

  getBlockPanelItems() {
    return [];
  }

  getHoveringBarElements() {
    return [];
  }

  toMarkdown(node: Element) {
    return `![${(node as any).caption}](${(node as any).url} "时间戳:${(node as any).time}")`;
  }
}

export default VideoScreenshotExtension;
