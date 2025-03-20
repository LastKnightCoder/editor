import { CellPlugin } from "../../types";
import Renderer from "./components/Renderer";
import Editor from "./components/Editor";

/**
 * 文本单元格插件
 */
const TextPlugin: CellPlugin = {
  type: "text",
  Renderer,
  Editor,

  // 文本不需要转换
  beforeSave: (value) => value,
  afterLoad: (value) => value,
};

export default TextPlugin;
