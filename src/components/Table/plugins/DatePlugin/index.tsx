import { CellPlugin } from "../../types";
import Renderer from "./components/Renderer";
import Editor from "./components/Editor";
import { parseDate } from "./utils/dateUtils";

/**
 * 日期单元格插件
 */
const DatePlugin: CellPlugin = {
  type: "date",
  Renderer,
  Editor,

  // 保存前将字符串转换为Date对象
  beforeSave: (value) => {
    if (!value) return null;

    // 如果已经是Date对象，返回它
    if (value instanceof Date) {
      return value;
    }

    // 尝试将字符串解析为Date
    return parseDate(String(value));
  },

  // 加载后确保是Date对象
  afterLoad: (value) => {
    if (!value) return null;

    // 如果已经是Date对象，返回它
    if (value instanceof Date) {
      return value;
    }

    // 尝试解析为Date
    return parseDate(String(value));
  },
};

export default DatePlugin;
