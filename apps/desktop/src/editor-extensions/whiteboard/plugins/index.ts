import { Editor, Element, Node } from "slate";
import {
  deleteWhiteboardContent,
  incrementWhiteboardContentRefCount,
} from "@/commands/white-board";
import { whiteboardEmbedPageId } from "@/entity/whiteboard-refs";
import type { WhiteboardElement } from "../types";

type WhiteboardEditor = Editor & {
  isInsertNewWhiteboard?: boolean;
};

const isWhiteboardElement = (node: Node): node is WhiteboardElement =>
  Element.isElement(node) && node.type === "whiteboard";

/**
 * 白板的引用计数（受信任层 plugin）：apply 不在 ElementBehaviors 的方法面上。
 * isBlock / isVoid 已由 v2 声明（kind / isVoid）承担。
 */
export const withSetting = (editor: Editor) => {
  const whiteboardEditor = editor as WhiteboardEditor;
  const { apply } = editor;

  editor.apply = op => {
    if (op.type === "insert_node" && isWhiteboardElement(op.node) && !op.node.entityRef) {
      const pageId = whiteboardEmbedPageId(op.node) as number | undefined;
      if (pageId !== undefined) {
        // 如果是新建白板或引用已有白板，则不恢复引用数
        // 因为新建时 createWhiteboardContent 已设置 ref_count = 1
        // 引用时 incrementWhiteboardContentRefCount 已手动增加
        if (whiteboardEditor.isInsertNewWhiteboard) {
          whiteboardEditor.isInsertNewWhiteboard = false;
        } else {
          // 撤回删除：需要恢复引用计数
          void incrementWhiteboardContentRefCount(pageId);
        }
      }
    }

    if (op.type === "remove_node" && isWhiteboardElement(op.node) && !op.node.entityRef) {
      const pageId = whiteboardEmbedPageId(op.node) as number | undefined;
      if (pageId !== undefined) {
        // 删除白板：减少引用计数
        void deleteWhiteboardContent(pageId);
      }
    }

    apply(op);
  };

  return editor;
};
