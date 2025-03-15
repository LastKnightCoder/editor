// 导出接口
export * from "./ISketchRenderer";

// 导出基类
export * from "./BaseSketchRenderer";

// 导出具体渲染器
export * from "./PathSketchRenderer";
export * from "./RectangleSketchRenderer";
export * from "./CircleSketchRenderer";

// 导出管理器
export * from "./SketchRendererManager";

// 导出单例实例
import { SketchRendererManager } from "./SketchRendererManager";
export const sketchRendererManager = SketchRendererManager.getInstance();
