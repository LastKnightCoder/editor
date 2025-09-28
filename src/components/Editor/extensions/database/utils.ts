import { Editor } from "slate";
import { setOrInsertNode } from "@/components/Editor/utils";
import { createDataTable } from "@/commands";
import { v4 as uuid } from "uuid";

export const insertDatabase = async (editor: Editor) => {
  const dataTable = await createDataTable({
    columns: [],
    rows: [],
  });

  const id = uuid();

  // @ts-ignore Slate 自定义元素标记
  editor.isInsertDatabase = true;

  setOrInsertNode(editor, {
    // @ts-ignore Slate 自定义元素
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
