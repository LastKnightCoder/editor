import MarkText from "../components/MarkText/index.tsx";
import { Bold, Italic, Strikethrough, Code } from "lucide-react";
import { IConfigItem } from "@tau/editor/api";

const markConfigs = [
  {
    icon: <Bold size={16} strokeWidth={2.5} />,
    mark: "bold",
    tooltip: "加粗",
    order: 1,
  },
  {
    icon: <Italic size={16} strokeWidth={2.5} />,
    mark: "italic",
    tooltip: "斜体",
    order: 2,
  },
  {
    icon: <Strikethrough size={16} strokeWidth={2.5} />,
    mark: "strikethrough",
    tooltip: "删除线",
    order: 4,
  },
  {
    icon: <Code size={16} strokeWidth={2.5} />,
    mark: "code",
    tooltip: "代码",
    order: 5,
  },
] as const;

export default markConfigs.map(config => {
  return {
    id: config.mark,
    compactGroup: "text-style" as const,
    order: config.order,
    element: () => <MarkText {...config} />,
  };
}) as IConfigItem[];
