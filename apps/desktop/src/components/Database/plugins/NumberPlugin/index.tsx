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
  filters: [
    {
      operator: "等于",
      label: "=",
      requiresValue: true,
      filter: (filterValue, row, column) => {
        const cellValue = row[column.id];
        if (typeof cellValue !== "number" || typeof filterValue !== "number") {
          return false;
        }
        return cellValue === filterValue;
      },
    },
    {
      operator: "大于",
      label: ">",
      requiresValue: true,
      filter: (filterValue, row, column) => {
        const cellValue = row[column.id];
        if (typeof cellValue !== "number" || typeof filterValue !== "number") {
          return false;
        }
        return cellValue > filterValue;
      },
    },
    {
      operator: "大于等于",
      label: ">=",
      requiresValue: true,
      filter: (filterValue, row, column) => {
        const cellValue = row[column.id];
        if (typeof cellValue !== "number" || typeof filterValue !== "number") {
          return false;
        }
        return cellValue >= filterValue;
      },
    },
    {
      operator: "小于",
      label: "<",
      requiresValue: true,
      filter: (filterValue, row, column) => {
        const cellValue = row[column.id];
        if (typeof cellValue !== "number" || typeof filterValue !== "number") {
          return false;
        }
        return cellValue < filterValue;
      },
    },
    {
      operator: "小于等于",
      label: "<=",
      requiresValue: true,
      filter: (filterValue, row, column) => {
        const cellValue = row[column.id];
        if (typeof cellValue !== "number" || typeof filterValue !== "number") {
          return false;
        }
        return cellValue <= filterValue;
      },
    },
    {
      operator: "为空",
      label: "为空",
      filter: (_filterValue, row, column) => {
        const cellValue = row[column.id];
        return cellValue === null || cellValue === undefined;
      },
    },
    {
      operator: "不为空",
      label: "不为空",
      filter: (_filterValue, row, column) => {
        const cellValue = row[column.id];
        return !(cellValue === null || cellValue === undefined);
      },
    },
  ],
};

export default NumberPlugin;
