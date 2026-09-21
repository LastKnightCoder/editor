import { Editor, Element, Node } from "slate";
import { deleteDataTable, incrementDataTableRefCount } from "@/commands/data-table";
import type { DatabaseElement } from "../types";

type DatabaseEditor = Editor & {
  isInsertDatabase?: boolean;
  isResetValue?: boolean;
};

const isDatabaseElement = (node: Node): node is DatabaseElement =>
  Element.isElement(node) && node.type === "database";

export const overwrite = (editor: Editor) => {
  const databaseEditor = editor as DatabaseEditor;
  const { isBlock, isVoid, apply } = editor;

  editor.isBlock = element => {
    return element.type === "database" ? true : isBlock(element);
  };

  editor.isVoid = element => {
    return element.type === "database" ? true : isVoid(element);
  };

  editor.apply = op => {
    if (op.type === "remove_node" && isDatabaseElement(op.node) && !databaseEditor.isResetValue) {
      void deleteDataTable(op.node.tableId);
    }

    if (op.type === "insert_node" && isDatabaseElement(op.node) && !databaseEditor.isResetValue) {
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
