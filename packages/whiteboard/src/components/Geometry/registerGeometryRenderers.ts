import { geometryRendererRegistry } from "./GeometryRendererRegistry";
import RectangleRenderer from "./renderers/RectangleRenderer";
import SizedShapeRenderer from "./renderers/SizedShapeRenderer";
import { sizedShapePaths } from "./sizedShapes";

// 注册几何图形渲染器
export const registerGeometryRenderers = (): void => {
  // 注册矩形渲染器
  geometryRendererRegistry.register({
    geometryType: "rectangle",
    renderer: RectangleRenderer,
    priority: 10,
  });
  for (const geometryType of Object.keys(sizedShapePaths)) {
    geometryRendererRegistry.register({
      geometryType,
      renderer: SizedShapeRenderer,
      priority: 10,
    });
  }
};
