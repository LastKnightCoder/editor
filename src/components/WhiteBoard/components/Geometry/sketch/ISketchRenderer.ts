import { GeometryElement } from "../../../plugins";
import React from "react";

/**
 * 草图渲染器接口的参数
 */
export interface SketchRendererProps {
  element: GeometryElement;
  width: number;
  height: number;
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  roughness: number;
  roughSvg: any; // RoughSVG 实例
  svgRef: React.RefObject<SVGSVGElement>;
}

/**
 * 草图渲染器接口
 */
export interface ISketchRenderer {
  /**
   * 判断当前渲染器是否可以处理指定的几何图形
   * @param geometryType 几何图形类型
   */
  canHandle(geometryType: string): boolean;

  /**
   * 渲染草图
   * @param props 渲染参数
   * @returns 是否成功渲染
   */
  render(props: SketchRendererProps): boolean;

  /**
   * 获取渲染器优先级
   */
  getPriority(): number;
}
