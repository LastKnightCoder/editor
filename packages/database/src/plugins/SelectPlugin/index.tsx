import { CellPlugin, SelectOption } from "../../types";
import Renderer from "./components/Renderer";
import Editor from "../../views/TableView/components/SelectEditor";
import OptionsConfigPanel from "./ConfigPanel";
import { CircleChevronDown } from "lucide-react";
import { selectFieldModel } from "./model";

const SelectPlugin: CellPlugin<{ options: SelectOption[] }> = {
  type: selectFieldModel.type,
  name: "单选",
  editable: true,
  capabilities: { singleOption: true },
  model: selectFieldModel,
  valueType: selectFieldModel.valueType,
  toScalar: selectFieldModel.toScalar,
  Renderer,
  ConfigPanel: OptionsConfigPanel,
  // @ts-ignore
  Editor,
  Icon: ({ className }) => <CircleChevronDown className={className} />,

  // 保存前确保值为字符串
  beforeSave: (value: string, config: { options: SelectOption[] }) => {
    if (value === null || value === undefined || value === "") return null;
    const options = Array.isArray(config?.options) ? config.options : [];
    const option = options.find(opt => opt.id === value);
    if (option) {
      return option.id;
    } else {
      return null;
    }
  },

  afterLoad: (value: string, config: { options: SelectOption[] }) => {
    if (value === null || value === undefined || value === "") return null;
    const options = Array.isArray(config?.options) ? config.options : [];
    const option = options.find(opt => opt.id === value);
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
  sort: params => {
    const { a, b, direction } = params;
    if (a === b) return 0;
    if (typeof a !== "string" || typeof b !== "string") return 0;
    return direction === "asc" ? a.localeCompare(b) : b.localeCompare(a);
  },
  search: (searchValue, cellValue, column) => {
    if (!cellValue || !searchValue) return false;
    const config = column.config as { options: SelectOption[] } | undefined;
    const options = config?.options ?? [];
    const option = options.find(opt => opt.id === cellValue);
    if (!option) return false;
    return option.name.toLowerCase().includes(searchValue.toLowerCase());
  },
  filters: [
    {
      operator: "是",
      label: "是",
      requiresValue: true,
      filter: (filterValue, row, column) => {
        const cellValue = row[column.id];
        if (typeof cellValue !== "string" || typeof filterValue !== "string") {
          return false;
        }
        return cellValue === filterValue;
      },
    },
    {
      operator: "不是",
      label: "不是",
      requiresValue: true,
      filter: (filterValue, row, column) => {
        const cellValue = row[column.id];
        if (typeof cellValue !== "string" || typeof filterValue !== "string") {
          return true;
        }
        return cellValue !== filterValue;
      },
    },
    {
      operator: "为空",
      label: "为空",
      filter: (_filterValue, row, column) => {
        const cellValue = row[column.id];
        return cellValue === null || cellValue === undefined || cellValue === "";
      },
    },
    {
      operator: "不为空",
      label: "不为空",
      filter: (_filterValue, row, column) => {
        const cellValue = row[column.id];
        return !(cellValue === null || cellValue === undefined || cellValue === "");
      },
    },
  ],
};

export default SelectPlugin;
