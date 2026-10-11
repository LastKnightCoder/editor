import React from "react";
import { CellPlugin, ColumnDef, SelectOption } from "../../types";
import Renderer from "./components/Renderer";
import SelectEditor from "../../views/TableView/components/SelectEditor";
import OptionsConfigPanel from "../SelectPlugin/ConfigPanel";
import { ListChecks } from "lucide-react";
import { multiSelectFieldModel } from "./model";

type EditorProps = React.ComponentProps<
  NonNullable<CellPlugin<{ options: SelectOption[] }>["Editor"]>
>;

// 多选编辑器：SelectEditor 由单选 / 多选共用，multiple 经包装显式传入
const Editor: React.FC<EditorProps> = props => (
  <SelectEditor
    {...props}
    column={props.column as ColumnDef<{ options: SelectOption[] }>}
    multiple={true}
  />
);

const MultiSelectPlugin: CellPlugin<{ options: SelectOption[] }> = {
  type: multiSelectFieldModel.type,
  name: "多选",
  editable: true,
  model: multiSelectFieldModel,
  valueType: multiSelectFieldModel.valueType,
  toScalar: multiSelectFieldModel.toScalar,
  Renderer,
  ConfigPanel: OptionsConfigPanel,
  Editor,
  Icon: ({ className }) => <ListChecks className={className} />,

  beforeSave: (value: string[], configs) => {
    if (!value || !Array.isArray(value)) return [];
    return value.filter(v => configs.options.find(opt => opt.id === v));
  },

  afterLoad: (value: string[], configs) => {
    if (!value || !Array.isArray(value)) return [];
    return value.filter(v => configs.options.find(opt => opt.id === v));
  },
  getGroupKey: (row, column) => {
    const value = row[column.id];
    if (!value || !Array.isArray(value)) return "";
    return value.join(",");
  },
  search: (searchValue, cellValue, column) => {
    if (!Array.isArray(cellValue) || !searchValue) return false;
    const config = column.config as { options: SelectOption[] } | undefined;
    const options = config?.options ?? [];
    const searchLower = searchValue.toLowerCase();
    return cellValue.some(id => {
      const option = options.find(opt => opt.id === id);
      return option?.name.toLowerCase().includes(searchLower);
    });
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
        const targets = Array.isArray(filterValue) ? filterValue : filterValue ? [filterValue] : [];
        if (!targets.length) return false;
        return targets.every(value => cellValue.includes(value));
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
        const targets = Array.isArray(filterValue) ? filterValue : filterValue ? [filterValue] : [];
        if (!targets.length) return false;
        return targets.some(value => cellValue.includes(value));
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
