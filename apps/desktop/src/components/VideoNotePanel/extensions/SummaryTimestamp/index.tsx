import { Node, Path, Text, Transforms } from "slate";
import { VideoController } from "../../VideoController";
import { defineElement, defineExtension, type ElementRenderProps, type Plugin } from "@tau/editor";
import SummaryTimestamp from "./components/SummaryTimestamp";
import { summaryTimestampElementDefinition } from "@/editor-extensions/element-definitions";

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

export const createSummaryTimestampExtension = (videoController: VideoController) =>
  defineExtension({
    id: "host.summary-timestamp",
    elements: [
      defineElement({
        ...summaryTimestampElementDefinition,
        render: (props: ElementRenderProps<SummaryTimestampElement>) => (
          <SummaryTimestamp
            {...props}
            onSeek={(time: number) => videoController.seekTo(time / 1000)}
          />
        ),
      }),
    ],
    plugins: [withInlineVoidPadding("summary-timestamp")],
  });
