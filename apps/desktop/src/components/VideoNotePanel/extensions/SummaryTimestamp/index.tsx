import { Element, Editor, Transforms, Node, Path, Text } from "slate";
import { VideoController } from "../../VideoController";
import { IExtension } from "@tau/editor/src";
import SummaryTimestamp from "./components/SummaryTimestamp";

export interface SummaryTimestampElement {
  type: "summary-timestamp";
  start: number; // Start time in milliseconds
  end: number; // End time in milliseconds
  children: { type: "formatted"; text: string }[];
}

// Utility function to format time from milliseconds
export const formatTimestampMs = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
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

class SummaryTimestampExtension implements IExtension {
  type = "summary-timestamp";

  constructor(private videoController: VideoController) {}

  getPlugins() {
    return [
      createInlineElementPlugin(this.type),
      createVoidElementPlugin(this.type),
      createInlineNormalizePlugin(this.type),
    ];
  }

  getHotkeyConfigs() {
    return [];
  }

  render(props: any) {
    return (
      <SummaryTimestamp
        {...props}
        onSeek={(time: number) => this.videoController.seekTo(time / 1000)}
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
    const { start, end } = node as any;
    return `:time{start=${start} end=${end}}`;
  }
}

export default SummaryTimestampExtension;
