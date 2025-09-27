import { CellPlugin } from "../../types";
import Renderer from "./components/Renderer";
import Editor from "./components/Editor";
import { parseNumber } from "./utils/numberUtils";
import { TbNumber } from "react-icons/tb";

const NumberPlugin: CellPlugin<any> = {
  type: "number",
  name: "数字",
  editable: true,
  Renderer,
  Editor,
  Icon: ({ className }) => <TbNumber className={className} />,

  // 保存前确保值为数字
  beforeSave: (value) => {
    if (value === null || value === undefined) return null;
    return parseNumber(value);
  },

  // 加载后确保值为数字
  afterLoad: (value) => {
    if (value === null || value === undefined) return null;
    return parseNumber(value);
  },

  getGroupKey: (row, column) => {
    return String(row[column.id]);
  },
  sort: (params) => {
    const { a, b, direction } = params;
    if (a === b) return 0;
    if (typeof a !== "number" || typeof b !== "number") return 0;

    return direction === "asc" ? a - b : b - a;
  },
};

export default NumberPlugin;
