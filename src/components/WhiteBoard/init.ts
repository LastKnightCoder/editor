import { registerGeometrySetters } from "./components/AttributeSetter/registerGeometrySetters";
import { registerGeometryRenderers } from "./components/Geometry/registerGeometryRenderers";

// 初始化白板相关功能
export function initWhiteBoard() {
  // 注册几何图形设置器
  registerGeometrySetters();

  // 注册几何图形渲染器
  registerGeometryRenderers();
}

// 自动执行初始化
initWhiteBoard();
