import { Editor } from "slate";
import { incrementDataTableRefCount, deleteDataTable } from "@/commands";

export const overwrite = (editor: Editor) => {
  const { isBlock, isVoid, apply } = editor;

  editor.isBlock = (element) => {
    // @ts-ignore
    return element.type === "database" ? true : isBlock(element);
  };

  editor.isVoid = (element) => {
    // @ts-ignore
    return element.type === "database" ? true : isVoid(element);
  };

  editor.apply = (op) => {
    if (
      op.type === "remove_node" &&
      op.node.type === "database" &&
      !editor.isResetValue
    ) {
      // @ts-ignore
      deleteDataTable(op.node.tableId);
    }

    if (
      op.type === "insert_node" &&
      op.node.type === "database" &&
      !editor.isResetValue
    ) {
      // @ts-ignore
      if (editor.isInsertDatabase) {
        // @ts-ignore
        editor.isInsertDatabase = false;
      } else {
        // @ts-ignore
        incrementDataTableRefCount(op.node.tableId);
      }
    }

    apply(op);
  };

  return editor;
};
