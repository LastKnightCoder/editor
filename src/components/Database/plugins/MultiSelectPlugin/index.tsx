import { CellPlugin, SelectOption } from "../../types";
import Renderer from "./components/Renderer";
import Editor from "../../views/TableView/components/SelectEditor";
import { MdChecklist } from "react-icons/md";

const MultiSelectPlugin: CellPlugin<{ options: SelectOption[] }> = {
  type: "multiSelect",
  name: "多选",
  editable: true,
  Renderer,
  // @ts-ignore
  Editor,
  Icon: ({ className }) => <MdChecklist className={className} />,

  beforeSave: (value: string[], configs) => {
    if (!value || !Array.isArray(value)) return [];
    return value.filter((v) => configs.options.find((opt) => opt.id === v));
  },

  afterLoad: (value: string[], configs) => {
    if (!value || !Array.isArray(value)) return [];
    return value.filter((v) => configs.options.find((opt) => opt.id === v));
  },
  getGroupKey: (row, column) => {
    const value = row[column.id];
    if (!value || !Array.isArray(value)) return "";
    return value.join(",");
  },
  filters: [
    {
      operator: "包含",
      label: "包含",
      requiresValue: true,
      filter: (filterValue, row, column) => {
        const cellValue = row[column.id];
        if (!Array.isArray(cellValue)) {
          return false;
        }
        const targets = Array.isArray(filterValue)
          ? filterValue
          : filterValue
            ? [filterValue]
            : [];
        console.log("targets", targets, cellValue);
        if (!targets.length) return false;
        return targets.every((value) => cellValue.includes(value));
      },
    },
    {
      operator: "包含任一",
      label: "包含任一",
      requiresValue: true,
      filter: (filterValue, row, column) => {
        const cellValue = row[column.id];
        if (!Array.isArray(cellValue)) {
          return false;
        }
        const targets = Array.isArray(filterValue)
          ? filterValue
          : filterValue
            ? [filterValue]
            : [];
        if (!targets.length) return false;
        return targets.some((value) => cellValue.includes(value));
      },
    },
    {
      operator: "为空",
      label: "为空",
      filter: (_filterValue, row, column) => {
        const cellValue = row[column.id];
        return !Array.isArray(cellValue) || cellValue.length === 0;
      },
    },
    {
      operator: "不为空",
      label: "不为空",
      filter: (_filterValue, row, column) => {
        const cellValue = row[column.id];
        return Array.isArray(cellValue) && cellValue.length > 0;
      },
    },
  ],
};

export default MultiSelectPlugin;
