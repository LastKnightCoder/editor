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
    };

    const pathNode = roughSvg.path(pathString, roughOptions);
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
        );
      }
    }
  }, [props, sketchEnabled, roughness]);

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
        const line1 = roughSvg.line(tip.x, tip.y, side1.x, side1.y, {
          stroke: color,
          strokeWidth: lineWidth,
          roughness: roughness * 0.7,
          seed: seed,
        });

        const line2 = roughSvg.line(tip.x, tip.y, side2.x, side2.y, {
          stroke: color,
          strokeWidth: lineWidth,
          roughness: roughness * 0.7,
          seed: seed,
        });

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
          },
        );

        if (roughSvg.svg) {
          roughSvg.svg.appendChild(circleNode);
        }
      }
      break;
  }
};

export default SketchArrow;
