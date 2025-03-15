import { ColorSetter } from "./ColorSetter";
import { StrokeWidthSetter } from "./StrokeWidthSetter";
import { AlignSetter } from "./AlignSetter";

// 导出所有设置器
export const allSetters = [
  new ColorSetter(),
  new StrokeWidthSetter(),
  new AlignSetter(),
];

// 导出各个设置器类，方便单独使用
export { ColorSetter, StrokeWidthSetter, AlignSetter };
