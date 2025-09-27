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
};

export default MultiSelectPlugin;
