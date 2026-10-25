import { Editor } from "slate";
import { v4 as uuid } from "uuid";
import { setOrInsertNode } from "@tau/editor";
import { createDataTable, createPendingDataTable } from "@/commands/data-table";

export const insertDatabase = async (editor: Editor) => {
  const referenced = "nodeTree" in editor ? await createPendingDataTable() : null;
  const dataTable = referenced
    ? referenced.table
    : await createDataTable({
        columns: [],
        rows: [],
      });

  const id = uuid();

  (editor as { isInsertDatabase?: boolean }).isInsertDatabase = true;

  setOrInsertNode(editor, {
    type: "database",
    id,
    ...(referenced ? { entityRef: referenced.reference } : { tableId: dataTable.id }),
    height: 24,
    children: [
      {
        type: "formatted",
        text: "",
      },
    ],
  });

  return dataTable;
};
