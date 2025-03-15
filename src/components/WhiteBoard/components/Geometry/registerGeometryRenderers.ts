import { geometryRendererRegistry } from "./GeometryRendererRegistry";
import RectangleRenderer from "./renderers/RectangleRenderer";

// 注册几何图形渲染器
export const registerGeometryRenderers = (): void => {
  // 注册矩形渲染器
  geometryRendererRegistry.register({
    geometryType: "rectangle",
    renderer: RectangleRenderer,
    priority: 10,
  });
};

// 导出单个渲染器，方便按需导入
export { RectangleRenderer };
