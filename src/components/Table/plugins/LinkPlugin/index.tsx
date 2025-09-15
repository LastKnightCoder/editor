import { CellPlugin, CellValue } from "../../types";
import { MdLink } from "react-icons/md";
import Renderer from "./Renderer";
import Editor from "./Editor";
import { normalizeUrl } from "./utils";

const LinkPlugin: CellPlugin<unknown> = {
  type: "link",
  name: "链接",
  editable: true,
  Renderer,
  Editor,
  Icon: ({ className }) => <MdLink className={className} />,
  beforeSave: (value) => {
    if (value === null || value === undefined)
      return null as unknown as CellValue;
    const raw = String(value).trim();
    if (!raw) return null as unknown as CellValue;
    return normalizeUrl(raw);
  },
  afterLoad: (value) => {
    if (value === null || value === undefined)
      return null as unknown as CellValue;
    const raw = String(value).trim();
    if (!raw) return null as unknown as CellValue;
    return raw;
  },
};

export default LinkPlugin;
