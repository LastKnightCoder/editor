import { CellPlugin } from "../../types";
import Renderer from "./components/Renderer";
import Editor from "../../components/SelectEditor";

/**
 * 单选下拉菜单单元格插件
 */
const SelectPlugin: CellPlugin = {
  type: "select",
  Renderer,
  Editor,

  // 保存前确保值为字符串
  beforeSave: (value) => {
    if (value === null || value === undefined || value === "") return null;
    return String(value);
  },

  // 加载后转换为字符串
  afterLoad: (value) => {
    if (value === null || value === undefined || value === "") return null;
    return String(value);
  },
};

export default SelectPlugin;
