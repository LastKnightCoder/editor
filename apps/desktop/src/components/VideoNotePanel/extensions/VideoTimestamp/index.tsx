import { Editor, Node, Path, Text, Transforms } from "slate";
import { VideoController } from "../../VideoController";
import {
  defineElement,
  defineExtension,
  type EditorCommand,
  type ElementRenderProps,
  type Plugin,
} from "@tau/editor";
import { ReactEditor } from "slate-react";
import VideoTimestamp from "./components/VideoTimestamp";

export interface VideoTimestampElement {
  type: "video-timestamp";
  time: number;
  previewUrl?: string; // Screenshot preview at this timestamp
  children: { type: "formatted"; text: string }[];
}

// Utility functions
const formatTimestamp = (time: number): string => {
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

const createTimestampElement = async (
  videoController: VideoController
): Promise<VideoTimestampElement> => {
  const time = videoController.getCurrentTime();
  const previewUrl = await videoController.captureVideoFrame();

  return {
    type: "video-timestamp",
    time,
    previewUrl: previewUrl || undefined,
    children: [{ type: "formatted", text: "" }],
  };
};

/** 行内 void 两侧补零宽字符（光标落点守护；与内核 inline-math 的规则同款） */
const withInlineVoidPadding =
  (type: string): Plugin =>
  editor => {
    const { normalizeNode } = editor;
    const zeroWidthChar = "\uFEFF";

    editor.normalizeNode = entry => {
      const [node, path] = entry;

      if ((node as { type?: string }).type === type) {
        const parentNode = Node.parent(editor, path);
        const isFirstChild = !Path.hasPrevious(path);
        const isLastChild = path[path.length - 1] === parentNode.children.length - 1;

        const nextPath = Path.next(path);

        let hasPreviousAdjacentInlineVoid = false;
        if (!isFirstChild) {
          const prevSibling = Node.get(editor, Path.previous(path));
          hasPreviousAdjacentInlineVoid = (prevSibling as { type?: string }).type === type;
        }

        if (isLastChild) {
          Transforms.insertNodes(editor, { type: "formatted", text: zeroWidthChar } as never, {
            at: nextPath,
          });
        }
        if (isFirstChild || hasPreviousAdjacentInlineVoid) {
          Transforms.insertNodes(editor, { type: "formatted", text: zeroWidthChar } as never, {
            at: path,
          });
        }
      }

      if (Text.isText(node) && (node as { type?: string }).type !== "formatted") {
        Transforms.setNodes(editor, { type: "formatted" } as never, { at: path });
        return;
      }

      normalizeNode(entry);
    };

    return editor;
  };

/** 在光标处插入当前播放时间戳（无选区时落到文末）；快捷键与工具栏按钮共用 */
export const insertVideoTimestamp = async (editor: Editor, videoController: VideoController) => {
  if (!editor.selection) Transforms.select(editor, Editor.end(editor, []));
  const timestampNode = await createTimestampElement(videoController);

  Transforms.collapse(editor, { edge: "end" });
  Transforms.insertNodes(editor, timestampNode as never);
  Transforms.insertNodes(editor, { type: "formatted", text: "" } as never);
  ReactEditor.focus(editor);
};

const timestampCommand = (videoController: VideoController): EditorCommand => ({
  id: "host.video-note.timestamp",
  title: "插入当前时间戳",
  run: async editor => {
    if (!editor.selection) return;
    await insertVideoTimestamp(editor, videoController);
  },
});

export const createVideoTimestampExtension = (videoController: VideoController) =>
  defineExtension({
    id: "host.video-timestamp",
    elements: [
      defineElement({
        type: "video-timestamp",
        kind: "inline",
        isVoid: true,
        render: ({ attributes, element, children }: ElementRenderProps<VideoTimestampElement>) => (
          <VideoTimestamp attributes={attributes} element={element} onSeek={videoController.seekTo}>
            {children}
          </VideoTimestamp>
        ),
      }),
    ],
    plugins: [withInlineVoidPadding("video-timestamp")],
    commands: [timestampCommand(videoController)],
    hotkeys: [{ key: "mod+shift+t", command: "host.video-note.timestamp" }],
  });

export { formatTimestamp };
