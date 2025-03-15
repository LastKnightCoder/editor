import React, { useRef, useEffect } from "react";
import { GeometryRendererProps } from "../GeometryRendererRegistry";
import rough from "roughjs/bin/rough";
import { sketchRendererManager } from "../sketch";

/**
 * 草图渲染器组件
 * 负责创建SVG元素和Rough.js实例，并调用渲染器管理类进行渲染
 */
const SketchRenderer: React.FC<GeometryRendererProps> = ({
  element,
  width,
  height,
  fill,
  fillOpacity,
  stroke,
  strokeWidth,
  strokeOpacity,
}) => {
  // 创建SVG引用
  const svgRef = useRef<SVGSVGElement>(null);

  // 从元素属性中获取草图风格设置
  const sketchEnabled = element.sketchEnabled || false;
  const roughness = element.roughness || 1;

  useEffect(() => {
    // 如果草图风格未启用或SVG元素未创建，则不执行任何操作
    if (!sketchEnabled || !svgRef.current) return;

    // 清空当前内容
    while (svgRef.current.firstChild) {
      svgRef.current.removeChild(svgRef.current.firstChild);
    }

    // 创建Rough.js实例
    // 注意：每次渲染都创建新的实例，避免多个元素共享同一个实例可能导致的问题
    const roughSvg = rough.svg(svgRef.current);

    // 使用渲染器管理类渲染草图
    const renderResult = sketchRendererManager.render({
      element,
      width,
      height,
      fill,
      fillOpacity,
      stroke,
      strokeWidth,
      strokeOpacity,
      roughness,
      roughSvg,
      svgRef,
    });

    // 如果渲染失败，可以在控制台输出调试信息
    if (!renderResult) {
      console.warn(`草图渲染失败: ${element.geometryType}`, element);
    }
  }, [
    element,
    width,
    height,
    fill,
    stroke,
    strokeWidth,
    roughness,
    fillOpacity,
    strokeOpacity,
    sketchEnabled,
  ]);

  // 如果草图风格未启用，则返回 null，让默认渲染器处理
  if (!sketchEnabled) {
    return null;
  }

  // 渲染SVG容器
  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      opacity={fillOpacity}
      style={{ overflow: "visible" }} // 确保草图效果不会被裁剪
    />
  );
};

export default SketchRenderer;
