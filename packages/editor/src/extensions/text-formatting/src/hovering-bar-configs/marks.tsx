import MarkText from "../components/MarkText/index.tsx";
import { Bold, Italic, Strikethrough, Code } from "lucide-react";
import { IConfigItem } from "@tau/editor/api";

const markConfigs = [
  {
    icon: <Bold size={16} strokeWidth={2.5} />,
    mark: "bold",
    tooltipMessage: "format.bold",
    order: 1,
  },
  {
    icon: <Italic size={16} strokeWidth={2.5} />,
    mark: "italic",
    tooltipMessage: "format.italic",
    order: 2,
  },
  {
    icon: <Strikethrough size={16} strokeWidth={2.5} />,
    mark: "strikethrough",
    tooltipMessage: "format.strike",
    order: 4,
  },
  {
    icon: <Code size={16} strokeWidth={2.5} />,
    mark: "code",
    tooltipMessage: "format.code",
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
