import { CellPlugin } from "../../types";
import Renderer from "./components/Renderer";
import Editor from "./components/Editor";
import { parseNumber } from "./utils/numberUtils";

/**
 * 数字单元格插件
 */
const NumberPlugin: CellPlugin = {
  type: "number",
  Renderer,
  Editor,

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
};

export default NumberPlugin;
