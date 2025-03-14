import SVG from "react-inlinesvg";
import MarkText from "../components/MarkText";

import bold from "@/assets/hovering_bar/bold.svg";
import italic from "@/assets/hovering_bar/italic.svg";
import strikethrough from "@/assets/hovering_bar/strikethrough.svg";
import code from "@/assets/hovering_bar/code.svg";
import { IConfigItem } from "@/components/Editor/types";

const markConfigs = [
  {
    icon: (
      <SVG src={bold} style={{ fill: "currentcolor", width: 16, height: 16 }} />
    ),
    mark: "bold",
    tooltip: "加粗",
    order: 1,
  },
  {
    icon: (
      <SVG
        src={italic}
        style={{ fill: "currentcolor", width: 14, height: 14 }}
      />
    ),
    mark: "italic",
    tooltip: "斜体",
    order: 2,
  },
  {
    icon: (
      <SVG
        src={strikethrough}
        style={{ fill: "currentcolor", width: 18, height: 18 }}
      />
    ),
    mark: "strikethrough",
    tooltip: "删除线",
    order: 4,
  },
  {
    icon: (
      <SVG src={code} style={{ fill: "currentcolor", width: 18, height: 18 }} />
    ),
    mark: "code",
    tooltip: "代码",
    order: 5,
  },
] as const;

export default markConfigs.map((config) => {
  return {
    id: config.mark,
    order: config.order,
    element: () => <MarkText {...config} />,
  };
}) as IConfigItem[];
