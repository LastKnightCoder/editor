import { Editor } from "slate";
import { v4 as uuid } from "uuid";
import { setOrInsertNode } from "../../utils";

export const insertDatabase = async (editor: Editor) => {
  const service = editor.services?.dataTable;
  if (!service?.create) {
    console.warn("dataTable service is not available");
    return null;
  }

  const dataTable = await service.create({
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
