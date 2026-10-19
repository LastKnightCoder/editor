import ColorText from "../components/ColorText/index.tsx";
import { IConfigItem } from "@tau/editor/api";

const colorConfigs: IConfigItem[] = [
  {
    id: "color",
    order: 10,
    element: ColorText,
  },
];

export default colorConfigs;
