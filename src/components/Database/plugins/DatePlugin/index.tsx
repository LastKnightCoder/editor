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
};

export default DatePlugin;
