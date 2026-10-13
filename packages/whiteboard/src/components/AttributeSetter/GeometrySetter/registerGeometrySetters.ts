import { geometrySetterManager } from "./GeometrySetterManager";
import { StyleSetter } from "./setters/StyleSetter";
import { AlignSetter } from "./setters/AlignSetter";
import { SketchSetter } from "./setters/SketchSetter";

/**
 * 注册几何图形设置器
 * 在init.ts中调用
 */
export function registerGeometrySetters() {
  // 样式（颜色 / 粗细 / 圆角合一，适用于所有几何图形）
  geometrySetterManager.register(new StyleSetter());
  geometrySetterManager.register(new AlignSetter());

  // 笔触（适用于所有几何图形）
  geometrySetterManager.register(new SketchSetter());
}
