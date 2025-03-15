import { geometrySetterRegistry } from "./GeometrySetterRegistry";
import RectangleCornerRadiusSetter from "./GeometrySetter/RectangleCornerRadiusSetter";

// 注册矩形圆角设置器
export function registerGeometrySetters() {
  // 注册矩形的圆角设置器
  geometrySetterRegistry.register({
    geometryType: "rectangle",
    component: RectangleCornerRadiusSetter,
    priority: 10,
  });
}

// 导出单个设置器，方便按需导入
export { RectangleCornerRadiusSetter };
