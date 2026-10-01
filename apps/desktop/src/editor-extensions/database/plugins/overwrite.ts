import { Editor, Element, Node } from "slate";
import { deleteDataTable, incrementDataTableRefCount } from "@/commands/data-table";
import type { DatabaseElement } from "../types";

type DatabaseEditor = Editor & {
  isInsertDatabase?: boolean;
};

const isDatabaseElement = (node: Node): node is DatabaseElement =>
  Element.isElement(node) && node.type === "database";

/**
 * 数据块的引用计数（受信任层 plugin）：apply 不在 ElementBehaviors 的方法面上。
 * isBlock / isVoid 已由 v2 声明（kind / isVoid）承担。
 */
export const overwrite = (editor: Editor) => {
  const databaseEditor = editor as DatabaseEditor;
  const { apply } = editor;

  editor.apply = op => {
    if (op.type === "remove_node" && isDatabaseElement(op.node)) {
      void deleteDataTable(op.node.tableId);
    }

    if (op.type === "insert_node" && isDatabaseElement(op.node)) {
      if (databaseEditor.isInsertDatabase) {
        databaseEditor.isInsertDatabase = false;
      } else {
        void incrementDataTableRefCount(op.node.tableId);
      }
    }

    apply(op);
  };

  return editor;
};
