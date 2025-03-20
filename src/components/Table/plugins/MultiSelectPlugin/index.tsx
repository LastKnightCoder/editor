import { CellPlugin } from "../../types";
import Renderer from "./components/Renderer";
import Editor from "../../components/SelectEditor";

/**
 * 多选下拉菜单单元格插件
 */
const MultiSelectPlugin: CellPlugin = {
  type: "multiSelect",
  Renderer,
  Editor,

  // 保存前确保值为字符串数组
  beforeSave: (value) => {
    if (!value) return null;
    if (Array.isArray(value)) {
      return value.map(String);
    }
    return [String(value)];
  },

  // 加载后转换为字符串数组
  afterLoad: (value) => {
    if (!value) return null;
    if (Array.isArray(value)) {
      return value.map(String);
    }
    return [String(value)];
  },
};

export default MultiSelectPlugin;
