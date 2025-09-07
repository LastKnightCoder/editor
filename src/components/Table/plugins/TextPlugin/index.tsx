import { CellPlugin } from "../../types";
import Renderer from "./components/Renderer";
import Editor from "./components/Editor";
import { MdTextFields } from "react-icons/md";

const TextPlugin: CellPlugin<any> = {
  type: "text",
  name: "文本",
  editable: true,
  Renderer,
  Editor,
  Icon: ({ className }: { className?: string }) => (
    <MdTextFields className={className} />
  ),

  beforeSave: (value: string) => value,
  afterLoad: (value: string) => value,
};

export default TextPlugin;
