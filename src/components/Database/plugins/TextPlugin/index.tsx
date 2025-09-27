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
};

export default TextPlugin;
