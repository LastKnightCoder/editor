import { CellPlugin } from "../../types";
import Renderer from "./components/Renderer";
import Editor from "./components/Editor";
import { MdCalendarToday } from "react-icons/md";

const DatePlugin: CellPlugin<any> = {
  type: "date",
  name: "日期",
  editable: true,
  Renderer,
  Editor,
  Icon: ({ className }) => <MdCalendarToday className={className} />,

  // 保存前转换为毫秒时间戳（number）
  beforeSave: (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return value;
    if (value instanceof Date) return value.getTime();
    return null;
  },

  // 加载后直接返回毫秒时间戳（严格仅 number 或 null）
  afterLoad: (value) => {
    if (value === null || value === undefined) return null;
    return typeof value === "number" ? value : null;
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
      operator: "是",
      label: "是",
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
      operator: "不早于",
      label: "不早于",
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
      operator: "不晚于",
      label: "不晚于",
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

export default DatePlugin;
