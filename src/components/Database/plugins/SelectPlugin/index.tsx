import { CellPlugin, SelectOption } from "../../types";
import Renderer from "./components/Renderer";
import Editor from "../../views/TableView/components/SelectEditor";
import { MdArrowDropDownCircle } from "react-icons/md";

const SelectPlugin: CellPlugin<{ options: SelectOption[] }> = {
  type: "select",
  name: "单选",
  editable: true,
  Renderer,
  // @ts-ignore
  Editor,
  Icon: ({ className }) => <MdArrowDropDownCircle className={className} />,

  // 保存前确保值为字符串
  beforeSave: (value: string, config: { options: SelectOption[] }) => {
    if (value === null || value === undefined || value === "") return null;
    const option = config.options.find((opt) => opt.id === value);
    if (option) {
      return option.id;
    } else {
      return null;
    }
  },

  afterLoad: (value: string, config: { options: SelectOption[] }) => {
    if (value === null || value === undefined || value === "") return null;
    const option = config.options.find((opt) => opt.id === value);
    if (option) {
      return option.id;
    } else {
      return null;
    }
  },
  getGroupKey: (row, column) => {
    const value = row[column.id];
    if (!value) return "";
    return value;
  },
  sort: (params) => {
    const { a, b, direction } = params;
    if (a === b) return 0;
    if (typeof a !== "string" || typeof b !== "string") return 0;
    return direction === "asc" ? a.localeCompare(b) : b.localeCompare(a);
  },
};

export default SelectPlugin;
