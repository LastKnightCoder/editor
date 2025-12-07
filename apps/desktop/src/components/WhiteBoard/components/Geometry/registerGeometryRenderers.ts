import { geometryRendererRegistry } from "./GeometryRendererRegistry";
import RectangleRenderer from "./renderers/RectangleRenderer";
import SketchRenderer from "./renderers/SketchRenderer";

// 注册几何图形渲染器
export const registerGeometryRenderers = (): void => {
  // 注册草图风格渲染器（优先级高于其他渲染器）
  geometryRendererRegistry.register({
    geometryType: "*",
    renderer: SketchRenderer,
    priority: 100,
  });

  // 注册矩形渲染器
  geometryRendererRegistry.register({
    geometryType: "rectangle",
    renderer: RectangleRenderer,
    priority: 10,
  });
};
