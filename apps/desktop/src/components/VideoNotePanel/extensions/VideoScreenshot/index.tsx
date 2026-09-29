import { Element, Editor, Path, Transforms } from "slate";
import { VideoController } from "../../VideoController";
import { IExtension, IHotKeyConfig, FormattedText, setOrInsertNode } from "@tau/editor/src";
import { ReactEditor } from "slate-react";
import VideoScreenshot from "./components/VideoScreenshot";
import { formatTimestamp } from "../VideoTimestamp";

export interface VideoScreenshotElement {
  type: "video-screenshot";
  url: string;
  time: number;
  caption: string;
  children: FormattedText[];
}

const createScreenshotElement = async (videoController: VideoController) => {
  const imageUrl = await videoController.captureVideoFrame();
  if (!imageUrl) return null;

  const time = videoController.getCurrentTime();
  const timestamp = formatTimestamp(time);

  return {
    type: "video-screenshot",
    url: imageUrl,
    time,
    caption: `视频截图 - ${timestamp}`,
    children: [{ type: "formatted", text: "" }],
  };
};

const createVoidElementPlugin = (type: string) => {
  return (editor: Editor) => {
    const { isVoid } = editor;
    editor.isVoid = element => {
      return element.type === type ? true : isVoid(element);
    };
    return editor;
  };
};

/** 在光标处插入当前帧截图（无选区时落到文末）；快捷键与工具栏按钮共用 */
export const insertVideoScreenshot = async (editor: Editor, videoController: VideoController) => {
  if (!editor.selection) Transforms.select(editor, Editor.end(editor, []));
  const screenshotNode = await createScreenshotElement(videoController);
  if (!screenshotNode) return;

  const path = setOrInsertNode(editor, screenshotNode as any);
  if (!path) return;

  const nextPath = Path.next(path);
  ReactEditor.focus(editor);
  Transforms.insertNodes(
    editor,
    { type: "paragraph", children: [{ type: "formatted", text: "" }] } as any,
    { at: nextPath, select: true }
  );
};

const createScreenshotHotkey = (videoController: VideoController): IHotKeyConfig => {
  return {
    hotKey: "mod+shift+s",
    action: async (editor: Editor) => {
      if (!editor.selection) return;
      await insertVideoScreenshot(editor, videoController);
    },
  };
};

const pauseVideoHotkey = (videoController: VideoController): IHotKeyConfig => {
  return {
    hotKey: "mod+shift+p",
    action: () => {
      videoController.pause();
    },
  };
};

const playVideoHotkey = (videoController: VideoController): IHotKeyConfig => {
  return {
    hotKey: "mod+shift+l",
    action: () => {
      videoController.play();
    },
  };
};

class VideoScreenshotExtension implements IExtension {
  type = "video-screenshot";

  dragSpec = true;

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
