import { memo, useRef, useEffect } from "react";
import rough from "roughjs/bin/rough";
import { EMarkerType, Point, EArrowLineType } from "../../types";
import { ArrowUtil } from "@/components/WhiteBoard/utils";

interface SketchArrowProps {
  sourceMarker: EMarkerType;
  targetMarker: EMarkerType;
  lineType: EArrowLineType;
  lineColor: string;
  lineWidth: number;
  points: Point[];
  sourceConnectId?: string;
  targetConnectId?: string;
  sketchEnabled: boolean;
  roughness: number;
  dashed?: boolean;
  dashArray?: number[];
  animated?: boolean;
  animationSpeed?: number;
}

const SketchArrow = memo((props: SketchArrowProps) => {
  const {
    sourceMarker,
    targetMarker,
    lineColor,
    lineWidth,
    sketchEnabled,
    roughness,
    points,
    dashed,
    dashArray,
    animated,
    animationSpeed,
  } = props;

  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    // 如果草图风格未启用或SVG元素未创建，则不执行任何操作
    if (!sketchEnabled || !svgRef.current) return;

    // 清空当前内容
    while (svgRef.current.firstChild) {
      svgRef.current.removeChild(svgRef.current.firstChild);
    }

    // 创建Rough.js实例
    const roughSvg = rough.svg(svgRef.current);

    // 获取箭头路径
    const pathString = ArrowUtil.getArrowPath(props);

    // 使用Rough.js渲染路径
    const roughOptions = {
      stroke: lineColor,
      strokeWidth: lineWidth,
      roughness: roughness || 1,
      fill: "none",
      bowing: 0.5,
      seed: Math.floor(Math.random() * 2000),
      ...(dashed && {
        strokeLineDash: dashArray || [5, 5],
        strokeLineDashOffset: 0,
      }),
    };

    const pathNode = roughSvg.path(pathString, roughOptions);

    // 添加流动动画
    if (animated) {
      const speed = animationSpeed || 3;
      // 调整速度公式：虚线更快
      const dashDuration = 1 / speed; // 虚线动画更快

      if (dashed) {
        // 虚线流动动画
        const dashLength = (dashArray || [5, 5]).reduce(
          (sum, val) => sum + val,
          0,
        );
        pathNode.style.animation = `dashFlow-sketch-${speed} ${dashDuration}s linear infinite`;
        pathNode.style.strokeDashoffset = `${dashLength}px`;

        // 创建草图虚线动画样式
        createSketchDashAnimation(speed, dashLength);
      }
    }

    svgRef.current.appendChild(pathNode);

    // 绘制箭头标记
    if (points.length >= 2) {
      // 绘制起点箭头标记
      if (sourceMarker !== EMarkerType.None) {
        const startPoint = points[0];
        const nextPoint = points[1];
        drawArrowMarker(
          roughSvg,
          startPoint,
          nextPoint,
          sourceMarker,
          lineColor,
          lineWidth,
          roughness,
          dashed,
          dashArray,
        );
      }

      // 绘制终点箭头标记
      if (targetMarker !== EMarkerType.None) {
        const endPoint = points[points.length - 1];
        const prevPoint = points[points.length - 2];
        drawArrowMarker(
          roughSvg,
          endPoint,
          prevPoint,
          targetMarker,
          lineColor,
          lineWidth,
          roughness,
          dashed,
          dashArray,
        );
      }
    }

    // 绘制流动点（仅适用于实线动画）
    if (animated && !dashed) {
      const speed = animationSpeed || 3;
      const flowDuration = 6 / speed;
      drawSketchFlowingDots(
        roughSvg,
        pathString,
        lineColor,
        lineWidth,
        flowDuration,
      );
    }
  }, [
    sketchEnabled,
    roughness,
    lineWidth,
    lineColor,
    points,
    sourceMarker,
    targetMarker,
    dashed,
    dashArray,
    animated,
    animationSpeed,
  ]);

  if (!sketchEnabled) return null;

  // 草图风格启用时，返回SVG容器
  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
        overflow: "visible",
      }}
    />
  );
});

// 绘制箭头标记
const drawArrowMarker = (
  roughSvg: any,
  point: Point,
  refPoint: Point,
  markerType: EMarkerType,
  color: string,
  lineWidth: number,
  roughness: number,
  dashed?: boolean,
  dashArray?: number[],
) => {
  // 计算箭头方向角度
  const angle = Math.atan2(point.y - refPoint.y, point.x - refPoint.x);

  // 箭头大小 - 根据线宽调整，但设置一个最小值
  const arrowSize = Math.max(10, 8 * lineWidth);

  // 随机种子，使每次绘制看起来都不同
  const seed = Math.floor(Math.random() * 2000);

  // 根据箭头类型绘制不同形状
  switch (markerType) {
    case EMarkerType.Arrow:
    case EMarkerType.ClosedArrow:
      // 绘制闭合三角形箭头 - Excalidraw 风格
      {
        // 计算箭头的偏移点，确保箭头与线条连接处对齐
        const offsetPoint = {
          x: point.x - Math.cos(angle) * (lineWidth / 2),
          y: point.y - Math.sin(angle) * (lineWidth / 2),
        };

        // 箭头尖端
        const tip = {
          x: offsetPoint.x,
          y: offsetPoint.y,
        };

        // 箭头两侧的点 - 调整角度使箭头更美观
        const side1 = {
          x: offsetPoint.x - Math.cos(angle - Math.PI / 6) * arrowSize,
          y: offsetPoint.y - Math.sin(angle - Math.PI / 6) * arrowSize,
        };

        const side2 = {
          x: offsetPoint.x - Math.cos(angle + Math.PI / 6) * arrowSize,
          y: offsetPoint.y - Math.sin(angle + Math.PI / 6) * arrowSize,
        };

        // 箭头底部中点
        const bottom = {
          x: (side1.x + side2.x) / 2,
          y: (side1.y + side2.y) / 2,
        };

        // 稍微向内收缩底部，使箭头更美观
        const adjustedSide1 = {
          x: side1.x + (bottom.x - side1.x) * 0.15,
          y: side1.y + (bottom.y - side1.y) * 0.15,
        };

        const adjustedSide2 = {
          x: side2.x + (bottom.x - side2.x) * 0.15,
          y: side2.y + (bottom.y - side2.y) * 0.15,
        };

        // 创建箭头路径
        const arrowPath = `M ${tip.x} ${tip.y} L ${adjustedSide1.x} ${adjustedSide1.y} L ${adjustedSide2.x} ${adjustedSide2.y} Z`;

        // 使用 Rough.js 绘制箭头
        const arrowNode = roughSvg.path(arrowPath, {
          stroke: color,
          strokeWidth: lineWidth * 0.5, // 箭头边框稍细一些
          roughness: roughness * 0.7, // 箭头的粗糙度稍低一些
          fill: color,
          fillStyle: "solid",
          seed: seed, // 使用相同的随机种子，保持一致性
          ...(dashed && {
            strokeLineDash: dashArray || [3, 3], // 箭头边框使用较小的虚线
            strokeLineDashOffset: 0,
          }),
        });

        if (roughSvg.svg) {
          roughSvg.svg.appendChild(arrowNode);
        }
      }
      break;

    case EMarkerType.OpenArrow:
      // 绘制开放式箭头 - Excalidraw 风格
      {
        // 计算箭头的偏移点，确保箭头与线条连接处对齐
        const offsetPoint = {
          x: point.x - Math.cos(angle) * (lineWidth / 2),
          y: point.y - Math.sin(angle) * (lineWidth / 2),
        };

        // 箭头尖端
        const tip = {
          x: offsetPoint.x,
          y: offsetPoint.y,
        };

        // 箭头两侧的点 - 调整角度使箭头更美观
        const side1 = {
          x: offsetPoint.x - Math.cos(angle - Math.PI / 6) * arrowSize,
          y: offsetPoint.y - Math.sin(angle - Math.PI / 6) * arrowSize,
        };

        const side2 = {
          x: offsetPoint.x - Math.cos(angle + Math.PI / 6) * arrowSize,
          y: offsetPoint.y - Math.sin(angle + Math.PI / 6) * arrowSize,
        };

        // 创建箭头路径 - 两条线段
        const lineOptions = {
          stroke: color,
          strokeWidth: lineWidth,
          roughness: roughness * 0.7,
          seed: seed,
          ...(dashed && {
            strokeLineDash: dashArray || [5, 5],
            strokeLineDashOffset: 0,
          }),
        };

        const line1 = roughSvg.line(
          tip.x,
          tip.y,
          side1.x,
          side1.y,
          lineOptions,
        );
        const line2 = roughSvg.line(
          tip.x,
          tip.y,
          side2.x,
          side2.y,
          lineOptions,
        );

        if (roughSvg.svg) {
          roughSvg.svg.appendChild(line1);
          roughSvg.svg.appendChild(line2);
        }
      }
      break;

    case EMarkerType.Diamond:
      // 绘制菱形箭头 - Excalidraw 风格
      {
        const size = arrowSize * 0.7;

        // 计算箭头的偏移点，确保箭头与线条连接处对齐
        const offsetPoint = {
          x: point.x - Math.cos(angle) * (lineWidth / 2),
          y: point.y - Math.sin(angle) * (lineWidth / 2),
        };

        // 菱形的四个点
        const tip = {
          x: offsetPoint.x,
          y: offsetPoint.y,
        };

        const bottom = {
          x: offsetPoint.x - Math.cos(angle) * size * 2,
          y: offsetPoint.y - Math.sin(angle) * size * 2,
        };

        const side1 = {
          x: offsetPoint.x - Math.cos(angle - Math.PI / 2) * size,
          y: offsetPoint.y - Math.sin(angle - Math.PI / 2) * size,
        };

        const side2 = {
          x: offsetPoint.x - Math.cos(angle + Math.PI / 2) * size,
          y: offsetPoint.y - Math.sin(angle + Math.PI / 2) * size,
        };

        // 创建菱形路径
        const diamondPath = `M ${tip.x} ${tip.y} L ${side1.x} ${side1.y} L ${bottom.x} ${bottom.y} L ${side2.x} ${side2.y} Z`;

        // 使用 Rough.js 绘制菱形
        const diamondNode = roughSvg.path(diamondPath, {
          stroke: color,
          strokeWidth: lineWidth * 0.5,
          roughness: roughness * 0.7,
          fill: color,
          fillStyle: "solid",
          seed: seed,
          ...(dashed && {
            strokeLineDash: dashArray || [3, 3], // 菱形边框使用较小的虚线
            strokeLineDashOffset: 0,
          }),
        });

        if (roughSvg.svg) {
          roughSvg.svg.appendChild(diamondNode);
        }
      }
      break;

    case EMarkerType.Circle:
      // 绘制圆形箭头 - Excalidraw 风格
      {
        // 圆心位置 - 沿着线条方向偏移
        const center = {
          x: point.x - Math.cos(angle) * arrowSize * 0.75,
          y: point.y - Math.sin(angle) * arrowSize * 0.75,
        };

        // 使用 Rough.js 绘制圆形
        const circleNode = roughSvg.circle(
          center.x,
          center.y,
          arrowSize * 1.2, // 直径
          {
            stroke: color,
            strokeWidth: lineWidth * 0.5,
            roughness: roughness * 0.7,
            fill: color,
            fillStyle: "solid",
            seed: seed,
            ...(dashed && {
              strokeLineDash: dashArray || [3, 3], // 圆形边框使用较小的虚线
              strokeLineDashOffset: 0,
            }),
          },
        );

        if (roughSvg.svg) {
          roughSvg.svg.appendChild(circleNode);
        }
      }
      break;
  }
};

// 创建草图虚线动画样式
const createSketchDashAnimation = (speed: number, dashLength: number) => {
  const styleId = `sketch-dash-animation-${speed}`;

  if (document.getElementById(styleId)) return;

  const style = document.createElement("style");
  style.id = styleId;

  style.textContent = `
    @keyframes dashFlow-sketch-${speed} {
      0% { stroke-dashoffset: ${dashLength}px; }
      100% { stroke-dashoffset: 0px; }
    }
  `;

  document.head.appendChild(style);
};

// 绘制草图风格的流光效果（使用纯 CSS/SVG 动画）
const drawSketchFlowingDots = (
  roughSvg: any,
  pathString: string,
  color: string,
  lineWidth: number,
  duration: number,
) => {
  if (!roughSvg.svg) return;

  try {
    // 创建临时path来计算长度
    const tempPath = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    tempPath.setAttribute("d", pathString);
    tempPath.style.visibility = "hidden";
    document.body.appendChild(tempPath);

    const pathLength = tempPath.getTotalLength();
    document.body.removeChild(tempPath);

    // 增加流光数量，增强可见性
    const flowCount = Math.max(1, Math.min(4, Math.floor(pathLength / 150)));

    // 清除之前的流光
    const existingFlows = roughSvg.svg.querySelectorAll(".sketch-flow-light");
    existingFlows.forEach((flow: any) => flow.remove());

    // 创建流光效果
    for (let i = 0; i < flowCount; i++) {
      const delay = (i / flowCount) * duration;

      // 创建流光组
      const flowGroup = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "g",
      );
      flowGroup.setAttribute("class", "sketch-flow-light");
      flowGroup.setAttribute("opacity", "0");

      // 获取更亮的颜色
      const brightColor = getBrighterColorForSketch(color);

      // 主光点（草图风格） - 更大更亮
      const mainDot = roughSvg.ellipse(
        0,
        0,
        Math.max(8, lineWidth * 2.0),
        Math.max(4, lineWidth * 1.0),
        {
          fill: brightColor,
          fillStyle: "solid",
          stroke: brightColor,
          strokeWidth: 1,
          roughness: 0.2,
        },
      );

      // 拖尾光点1（草图风格） - 更大
      const tail1 = roughSvg.ellipse(
        -12,
        0,
        Math.max(6, lineWidth * 1.5),
        Math.max(3, lineWidth * 0.75),
        {
          fill: brightColor,
          fillStyle: "solid",
          stroke: brightColor,
          strokeWidth: 1,
          roughness: 0.2,
        },
      );

      // 拖尾光点2（草图风格） - 更大
      const tail2 = roughSvg.ellipse(
        -22,
        0,
        Math.max(4, lineWidth * 1.0),
        Math.max(2, lineWidth * 0.5),
        {
          fill: brightColor,
          fillStyle: "solid",
          stroke: brightColor,
          strokeWidth: 1,
          roughness: 0.2,
        },
      );

      if (tail2) {
        tail2.setAttribute("opacity", "0.6");
        flowGroup.appendChild(tail2);
      }

      if (tail1) {
        tail1.setAttribute("opacity", "0.8");
        flowGroup.appendChild(tail1);
      }

      if (mainDot) {
        flowGroup.appendChild(mainDot);
      }

      // 创建沿路径移动的动画
      const animateMotion = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "animateMotion",
      );
      animateMotion.setAttribute("dur", `${duration}s`);
      animateMotion.setAttribute("repeatCount", "indefinite");
      animateMotion.setAttribute("begin", `${delay}s`);
      animateMotion.setAttribute("path", pathString);
      animateMotion.setAttribute("rotate", "auto"); // 自动旋转跟随路径方向

      // 创建透明度动画 - 更明显的亮度变化
      const animateOpacity = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "animate",
      );
      animateOpacity.setAttribute("attributeName", "opacity");
      animateOpacity.setAttribute("values", "0;1;1;0");
      animateOpacity.setAttribute("keyTimes", "0;0.2;0.8;1");
      animateOpacity.setAttribute("dur", `${duration}s`);
      animateOpacity.setAttribute("repeatCount", "indefinite");
      animateOpacity.setAttribute("begin", `${delay}s`);

      // 将动画添加到流光组
      flowGroup.appendChild(animateMotion);
      flowGroup.appendChild(animateOpacity);

      roughSvg.svg.appendChild(flowGroup);
    }
  } catch (error) {
    console.warn("Failed to create sketch flowing lights:", error);
  }
};

// 获取更亮的颜色（草图模式专用）
const getBrighterColorForSketch = (color: string): string => {
  // 如果是深色，返回更亮的版本
  if (color.toLowerCase() === "#000000" || color.toLowerCase() === "black") {
    return "#4488ff"; // 更亮的蓝色
  }
  if (color.toLowerCase() === "#ffffff" || color.toLowerCase() === "white") {
    return "#ffff88"; // 更亮的黄色
  }

  // 尝试解析十六进制颜色并增加亮度
  const hex = color.replace("#", "");
  if (hex.length === 6) {
    const r = Math.min(255, parseInt(hex.substr(0, 2), 16) + 100);
    const g = Math.min(255, parseInt(hex.substr(2, 2), 16) + 100);
    const b = Math.min(255, parseInt(hex.substr(4, 2), 16) + 100);
    return `rgb(${r}, ${g}, ${b})`;
  }

  return color; // 如果无法解析，返回原色
};

export default SketchArrow;
