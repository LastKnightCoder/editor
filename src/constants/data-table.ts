import { DataTableColumn, DataTableRow } from "@/types";
import { v4 as uuidv4 } from "uuid";

export const DEFAULT_COLUMNS: DataTableColumn[] = [
  {
    id: uuidv4(),
    title: "文本",
    type: "text",
    width: 100,
  },
  {
    id: uuidv4(),
    title: "数字",
    type: "number",
    width: 100,
  },
  {
    id: uuidv4(),
    title: "复选框",
    type: "checkbox",
    width: 100,
  },
];

export const DEFAULT_ROWS: DataTableRow[] = [
  {
    id: uuidv4(),
    text: "文本1",
    number: 1,
    checkbox: true,
  },
  {
    id: uuidv4(),
    text: "文本2",
    number: 2,
    checkbox: false,
  },
];
