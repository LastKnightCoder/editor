import { Editor, Path, Transforms } from "slate";
import { VideoController } from "../../VideoController";
import {
  setOrInsertNode,
  defineElement,
  defineExtension,
  type EditorCommand,
  type EditorHotkey,
  type ElementRenderProps,
} from "@tau/editor";
import { ReactEditor } from "slate-react";
import VideoScreenshot from "./components/VideoScreenshot";
import { formatTimestamp } from "../VideoTimestamp";
import type { FormattedText } from "@tau/editor";

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

/** 在光标处插入当前帧截图（无选区时落到文末）；快捷键与工具栏按钮共用 */
export const insertVideoScreenshot = async (editor: Editor, videoController: VideoController) => {
  if (!editor.selection) Transforms.select(editor, Editor.end(editor, []));
  const screenshotNode = await createScreenshotElement(videoController);
  if (!screenshotNode) return;

  const path = setOrInsertNode(editor, screenshotNode as never);
  if (!path) return;

  const nextPath = Path.next(path);
  ReactEditor.focus(editor);
  Transforms.insertNodes(
    editor,
    { type: "paragraph", children: [{ type: "formatted", text: "" }] } as never,
    { at: nextPath, select: true }
  );
};

/** 截图与播放控制命令（原三个散装热键） */
const videoControlCommands = (videoController: VideoController): EditorCommand[] => [
  {
    id: "host.video-note.screenshot",
    title: "截取当前帧",
    run: async editor => {
      if (!editor.selection) return;
      await insertVideoScreenshot(editor, videoController);
    },
  },
  {
    id: "host.video-note.play",
    title: "播放视频",
    run: () => {
      videoController.play();
    },
  },
  {
    id: "host.video-note.pause",
    title: "暂停视频",
    run: () => {
      videoController.pause();
    },
  },
];

export const createVideoScreenshotExtension = (videoController: VideoController) =>
  defineExtension({
    id: "host.video-screenshot",
    elements: [
      defineElement({
        type: "video-screenshot",
        kind: "block",
        isVoid: true,
        render: ({ attributes, element, children }: ElementRenderProps<VideoScreenshotElement>) => (
          <VideoScreenshot
            attributes={attributes}
            element={element}
            children={children}
            onSeek={videoController.seekTo}
          />
        ),
        drag: true,
      }),
    ],
    commands: videoControlCommands(videoController),
    hotkeys: [
      { key: "mod+shift+s", command: "host.video-note.screenshot" },
      { key: "mod+shift+l", command: "host.video-note.play" },
      { key: "mod+shift+p", command: "host.video-note.pause" },
    ] as EditorHotkey[],
  });
