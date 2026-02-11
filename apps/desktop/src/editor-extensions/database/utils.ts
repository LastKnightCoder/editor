import { Editor } from "slate";
import { v4 as uuid } from "uuid";
import { setOrInsertNode } from "@tau/editor/src";
import { createDataTable } from "@/commands/data-table";

export const insertDatabase = async (editor: Editor) => {
  const dataTable = await createDataTable({
    columns: [],
    rows: [],
  });

  const id = uuid();

  (editor as { isInsertDatabase?: boolean }).isInsertDatabase = true;

  setOrInsertNode(editor, {
    type: "database",
    id,
    tableId: dataTable.id,
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
