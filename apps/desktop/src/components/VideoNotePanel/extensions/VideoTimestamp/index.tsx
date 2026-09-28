import { Element, Editor, Transforms, Node, Path, Text } from "slate";
import { VideoController } from "../../VideoController";
import { IExtension, IHotKeyConfig } from "@tau/editor/src";
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

// Plugins
const createInlineElementPlugin = (type: string) => {
  return (editor: Editor) => {
    const { isInline } = editor;
    editor.isInline = element => {
      return element.type === type ? true : isInline(element);
    };
    return editor;
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

const createInlineNormalizePlugin = (type: string) => {
  return (editor: Editor) => {
    const { normalizeNode } = editor;

    editor.normalizeNode = entry => {
      const zeroWidthChar = "\uFEFF";
      const [node, path] = entry;

      if ((node as any).type === type) {
        const parentNode = Node.parent(editor, path);
        const isFirstChild = !Path.hasPrevious(path);
        const isLastChild = path[path.length - 1] === parentNode.children.length - 1;

        const nextPath = Path.next(path);

        let hasPreviousAdjacentInlineVoid = false;
        if (!isFirstChild) {
          const prevSibling = Node.get(editor, Path.previous(path));
          hasPreviousAdjacentInlineVoid = (prevSibling as any).type === type;
        }

        if (isLastChild) {
          Transforms.insertNodes(editor, { type: "formatted", text: zeroWidthChar } as any, {
            at: nextPath,
          });
        }
        if (isFirstChild || hasPreviousAdjacentInlineVoid) {
          Transforms.insertNodes(editor, { type: "formatted", text: zeroWidthChar } as any, {
            at: path,
          });
        }
      }

      if (Text.isText(node) && (node as any).type !== "formatted") {
        Transforms.setNodes(editor, { type: "formatted" } as any, { at: path });
        return;
      }

      normalizeNode(entry);
    };

    return editor;
  };
};

/** 在光标处插入当前播放时间戳（无选区时落到文末）；快捷键与工具栏按钮共用 */
export const insertVideoTimestamp = async (editor: Editor, videoController: VideoController) => {
  if (!editor.selection) Transforms.select(editor, Editor.end(editor, []));
  const timestampNode = await createTimestampElement(videoController);

  Transforms.collapse(editor, { edge: "end" });
  Transforms.insertNodes(editor, timestampNode as any);
  Transforms.insertNodes(editor, { type: "formatted", text: "" } as any);
  ReactEditor.focus(editor);
};

// Hotkey
const createTimestampHotkey = (videoController: VideoController): IHotKeyConfig => {
  return {
    hotKey: "mod+shift+t",
    action: async (editor: Editor) => {
      if (!editor.selection) return;
      await insertVideoTimestamp(editor, videoController);
    },
  };
};

class VideoTimestampExtension implements IExtension {
  type = "video-timestamp";

  constructor(private videoController: VideoController) {}

  getPlugins() {
    return [
      createInlineElementPlugin(this.type),
      createVoidElementPlugin(this.type),
      createInlineNormalizePlugin(this.type),
    ];
  }

  getHotkeyConfigs(): IHotKeyConfig[] {
    return [createTimestampHotkey(this.videoController)];
  }

  render(props: any) {
    return (
      <VideoTimestamp
        {...props}
        onSeek={this.videoController.seekTo}
        videoController={this.videoController}
      />
    );
  }

  getBlockPanelItems() {
    return [];
  }

  getHoveringBarElements() {
    return [];
  }

  toMarkdown(node: Element) {
    const text = (node.children as any[]).map(child => child.text).join("");
    return `[${text}](时间戳:${(node as any).time})`;
  }
}

export { formatTimestamp };
export default VideoTimestampExtension;
