import { ISketchRenderer, SketchRendererProps } from "./ISketchRenderer";
import type { Options } from "roughjs/bin/core";

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
  protected getRoughOptions(props: SketchRendererProps): Options {
    const { element, fill, stroke, strokeWidth } = props;
    const sketchOptions = element.sketchOptions || {};

    // 确保填充颜色正确设置
    const hasFill = fill && fill !== "none";

    const options: Options = {
      stroke: stroke || "#000",
      strokeWidth: strokeWidth || 1,
      roughness: sketchOptions.roughness || 1,
      seed: sketchOptions.seed,

      // 填充相关配置
      fill: hasFill ? fill : undefined,
      fillStyle: sketchOptions.fillStyle || "hachure",

      // 填充样式相关参数
      hachureAngle: sketchOptions.hachureAngle || 0,
      hachureGap: sketchOptions.hachureGap || 8,
      fillWeight: sketchOptions.fillWeight || 1,
      dashOffset: sketchOptions.dashOffset || 4,
      dashGap: sketchOptions.dashGap || 4,
      zigzagOffset: sketchOptions.zigzagOffset || 4,
    };

    // 如果没有填充色，则禁用填充
    if (!hasFill) {
      options.fillStyle = "none";
      options.fill = undefined;
    }

    return options;
  }
}
