import { CellPlugin } from "../../types";
import Renderer from "./components/Renderer";
import Editor from "./components/Editor";
import { parseNumber } from "./utils/numberUtils";
import { TbNumber } from "react-icons/tb";

const NumberPlugin: CellPlugin<any> = {
  type: "number",
  name: "数字",
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
};

export default NumberPlugin;
