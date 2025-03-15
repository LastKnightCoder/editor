import { ISketchRenderer, SketchRendererProps } from "./ISketchRenderer";

/**
 * 基础草图渲染器抽象类
 */
export abstract class BaseSketchRenderer implements ISketchRenderer {
  protected readonly geometryTypes: string[];
  protected readonly priority: number;

  /**
   * 构造函数
   * @param geometryTypes 支持的几何图形类型数组
   * @param priority 优先级，数值越大优先级越高
   */
  constructor(geometryTypes: string[], priority = 10) {
    this.geometryTypes = geometryTypes;
    this.priority = priority;
  }

  /**
   * 判断当前渲染器是否可以处理指定的几何图形
   * @param geometryType 几何图形类型
   */
  canHandle(geometryType: string): boolean {
    return (
      this.geometryTypes.includes(geometryType) ||
      this.geometryTypes.includes("*")
    );
  }

  /**
   * 获取渲染器优先级
   */
  getPriority(): number {
    return this.priority;
  }

  /**
   * 渲染草图（抽象方法，需要子类实现）
   * @param props 渲染参数
   */
  abstract render(props: SketchRendererProps): boolean;

  /**
   * 获取Rough.js渲染选项
   * @param props 渲染参数
   */
  protected getRoughOptions(props: SketchRendererProps) {
    const { fill, stroke, strokeWidth, roughness, fillOpacity } = props;

    // 确保填充颜色正确设置，如果有填充颜色但没有指定不透明度，则使用默认值
    const hasFill = fill && fill !== "none";

    return {
      fill: hasFill ? fill : "none",
      fillStyle: hasFill ? "solid" : "none",
      fillWeight: hasFill ? 0.5 : 0,
      stroke: stroke || "#000",
      strokeWidth: strokeWidth || 1,
      roughness: roughness || 1,
      opacity: fillOpacity,
    };
  }
}
