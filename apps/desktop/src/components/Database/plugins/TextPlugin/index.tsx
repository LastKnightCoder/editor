import { CellPlugin } from "../../types";
import Renderer from "./components/Renderer";
import Editor from "./components/Editor";
import { MdTextFields } from "react-icons/md";

const TextPlugin: CellPlugin<any> = {
  type: "text",
  name: "文本",
  editable: true,
  Renderer,
  Editor,
  Icon: ({ className }: { className?: string }) => (
    <MdTextFields className={className} />
  ),

  beforeSave: (value: string) => value,
  afterLoad: (value: string) => value,
  getGroupKey: (row, column) => {
    return String(row[column.id]);
  },
  sort: (params) => {
    const { a, b, direction } = params;
    if (a === b) return 0;
    if (typeof a !== "string" || typeof b !== "string") return 0;
    return direction === "asc" ? a.localeCompare(b) : b.localeCompare(a);
  },
  filters: [
    {
      operator: "包含",
      label: "包含",
      requiresValue: true,
      filter: (filterValue, row, column) => {
        const cellValue = row[column.id];
        if (typeof cellValue !== "string" || typeof filterValue !== "string") {
          return false;
        }
        return cellValue.includes(filterValue);
      },
    },
    {
      operator: "不包含",
      label: "不包含",
      requiresValue: true,
      filter: (filterValue, row, column) => {
        const cellValue = row[column.id];
        if (typeof cellValue !== "string" || typeof filterValue !== "string") {
          return true;
        }
        return !cellValue.includes(filterValue);
      },
    },
    {
      operator: "为空",
      label: "为空",
      filter: (_filterValue, row, column) => {
        const cellValue = row[column.id];
        return (
          cellValue === null || cellValue === undefined || cellValue === ""
        );
      },
    },
    {
      operator: "不为空",
      label: "不为空",
      filter: (_filterValue, row, column) => {
        const cellValue = row[column.id];
        return !(
          cellValue === null ||
          cellValue === undefined ||
          cellValue === ""
        );
      },
    },
  ],
};

export default TextPlugin;
