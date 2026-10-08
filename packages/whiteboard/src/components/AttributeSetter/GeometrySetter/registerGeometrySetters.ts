import { geometrySetterManager } from "./GeometrySetterManager";
import { RectangleCornerRadiusSetter } from "./setters/RectangleCornerRadiusSetter";
import { ColorSetter } from "./setters/ColorSetter";
import { StrokeWidthSetter } from "./setters/StrokeWidthSetter";
import { AlignSetter } from "./setters/AlignSetter";
import { SketchSetter } from "./setters/SketchSetter";

/**
 * 注册几何图形设置器
 * 在init.ts中调用
 */
export function registerGeometrySetters() {
  // 注册基础设置器
  geometrySetterManager.register(new ColorSetter());
  geometrySetterManager.register(new StrokeWidthSetter());
  geometrySetterManager.register(new AlignSetter());

  // 注册矩形的圆角设置器
  geometrySetterManager.register(new RectangleCornerRadiusSetter());

  // 笔触（适用于所有几何图形）
  geometrySetterManager.register(new SketchSetter());
}
