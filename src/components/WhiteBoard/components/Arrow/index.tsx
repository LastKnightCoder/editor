import { memo, useRef, useEffect } from "react";

import { EMarkerType, Point, EArrowLineType } from "../../types";
import { ArrowUtil } from "@/components/WhiteBoard/utils";
import SketchArrow from "./SketchArrow";

interface ArrowProps {
  sourceMarker: EMarkerType;
  targetMarker: EMarkerType;
  lineType: EArrowLineType;
  lineColor: string;
  lineWidth: number;
  points: Point[];
  sourceConnectId?: string;
  targetConnectId?: string;
  sketchEnabled?: boolean;
  roughness?: number;
  dashed?: boolean;
  dashArray?: number[];
  animated?: boolean;
  animationSpeed?: number;
}

// 获取箭头标记的URL
const getMarkerUrl = (markerType: EMarkerType): string => {
  switch (markerType) {
    case EMarkerType.Arrow:
      return "url(#whiteboard-arrow)";
    case EMarkerType.OpenArrow:
      return "url(#whiteboard-open-arrow)";
    case EMarkerType.ClosedArrow:
      return "url(#whiteboard-closed-arrow)";
    case EMarkerType.Diamond:
      return "url(#whiteboard-diamond)";
    case EMarkerType.Circle:
      return "url(#whiteboard-circle)";
    case EMarkerType.None:
    default:
      return "none";
  }
};

const Arrow = memo((props: ArrowProps) => {
  const {
    sourceMarker,
    targetMarker,
    lineColor,
    lineWidth,
    sketchEnabled = false,
    roughness = 1,
    dashed = false,
    dashArray,
    animated = false,
    animationSpeed = 3,
  } = props;

  // 否则使用普通箭头渲染
  const pathRef = useRef<SVGPathElement>(null);
  const svgRef = useRef<SVGGElement>(null);

  useEffect(() => {
    if (!animated || !pathRef.current || !svgRef.current) return;

    const speed = animationSpeed || 3;
    const dashDuration = 1 / speed;
    const flowDuration = 6 / speed;
    const pathElement = pathRef.current;
    const pathData = pathElement.getAttribute("d");

    if (dashed) {
      // 虚线流动动画 - 更快的节奏
      const dashLength = (dashArray || [5, 5]).reduce(
        (sum, val) => sum + val,
        0,
      );
      pathElement.style.animation = `dashFlow-${speed} ${dashDuration}s linear infinite`;
      pathElement.style.strokeDashoffset = `${dashLength}px`;
    } else {
      // 实线流光效果 - 增加流光感和可见性
      const pathLength = pathElement.getTotalLength();
      const flowCount = Math.max(1, Math.min(4, Math.floor(pathLength / 150))); // 增加流光数量

      // 清除之前的流光
      const existingFlows = svgRef.current.querySelectorAll(".flow-light");
      existingFlows.forEach((flow) => flow.remove());

      // 创建流光效果
      for (let i = 0; i < flowCount; i++) {
        const delay = (i / flowCount) * flowDuration;

        // 创建流光组
        const flowGroup = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "g",
        );
        flowGroup.setAttribute("class", "flow-light");
        flowGroup.setAttribute("opacity", "0");

        // 获取更亮的颜色
        const brightColor = getBrighterColor(lineColor);

        // 主光点 - 更大更亮
        const mainDot = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "ellipse",
        );
        mainDot.setAttribute("rx", `${Math.max(5, lineWidth * 1.5)}`);
        mainDot.setAttribute("ry", `${Math.max(2.5, lineWidth * 0.75)}`);
        mainDot.setAttribute("fill", brightColor);
        mainDot.setAttribute("filter", "url(#strongGlow)");

        // 拖尾光点1 - 更大
        const tail1 = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "ellipse",
        );
        tail1.setAttribute("rx", `${Math.max(3, lineWidth * 1.0)}`);
        tail1.setAttribute("ry", `${Math.max(1.5, lineWidth * 0.5)}`);
        tail1.setAttribute("fill", brightColor);
        tail1.setAttribute("opacity", "0.8");
        tail1.setAttribute("filter", "url(#mediumGlow)");
        tail1.setAttribute("transform", "translate(-10, 0)");

        // 拖尾光点2 - 更大
        const tail2 = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "ellipse",
        );
        tail2.setAttribute("rx", `${Math.max(2, lineWidth * 0.7)}`);
        tail2.setAttribute("ry", `${Math.max(1, lineWidth * 0.35)}`);
        tail2.setAttribute("fill", brightColor);
        tail2.setAttribute("opacity", "0.5");
        tail2.setAttribute("filter", "url(#lightGlow)");
        tail2.setAttribute("transform", "translate(-20, 0)");

        flowGroup.appendChild(tail2);
        flowGroup.appendChild(tail1);
        flowGroup.appendChild(mainDot);

        // 创建沿路径移动的动画
        const animateMotion = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "animateMotion",
        );
        animateMotion.setAttribute("dur", `${flowDuration}s`);
        animateMotion.setAttribute("repeatCount", "indefinite");
        animateMotion.setAttribute("begin", `${delay}s`);
        animateMotion.setAttribute("path", pathData || "");
        animateMotion.setAttribute("rotate", "auto"); // 自动旋转跟随路径方向

        // 创建透明度动画 - 更明显的亮度变化
        const animateOpacity = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "animate",
        );
        animateOpacity.setAttribute("attributeName", "opacity");
        animateOpacity.setAttribute("values", "0;1;1;0");
        animateOpacity.setAttribute("keyTimes", "0;0.2;0.8;1");
        animateOpacity.setAttribute("dur", `${flowDuration}s`);
        animateOpacity.setAttribute("repeatCount", "indefinite");
        animateOpacity.setAttribute("begin", `${delay}s`);

        // 将动画添加到流光组
        flowGroup.appendChild(animateMotion);
        flowGroup.appendChild(animateOpacity);

        svgRef.current.appendChild(flowGroup);
      }

      // 创建增强的辉光滤镜
      createEnhancedGlowFilters(svgRef.current);
    }

    // 动态创建CSS动画（仅虚线需要）
    if (dashed) {
      createAnimationStyles(speed, dashArray);
    }

    return () => {
      if (pathElement) {
        pathElement.style.animation = "";
        pathElement.style.strokeDashoffset = "";
      }
      // 清理流光元素
      if (svgRef.current) {
        const flows = svgRef.current.querySelectorAll(".flow-light");
        flows.forEach((flow) => flow.remove());
        // 移除所有辉光滤镜
        const filters = svgRef.current.querySelectorAll(
          "#strongGlow, #mediumGlow, #lightGlow",
        );
        filters.forEach((filter) => filter.remove());
        const defs = svgRef.current.querySelector("defs");
        if (defs && defs.children.length === 0) {
          defs.remove();
        }
      }
    };
  }, [animated, dashed, dashArray, animationSpeed, lineColor, lineWidth]);

  // 如果启用了草图风格，使用 SketchArrow 组件
  if (sketchEnabled) {
    return (
      <SketchArrow {...props} sketchEnabled={true} roughness={roughness} />
    );
  }

  // 创建动画样式（仅用于虚线动画）
  const createAnimationStyles = (speed: number, dashArray?: number[]) => {
    const styleId = `arrow-dash-animation-${speed}`;

    // 避免重复创建相同的样式
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;

    const dashLength = dashArray
      ? dashArray.reduce((sum, val) => sum + val, 0)
      : 10;

    style.textContent = `
      @keyframes dashFlow-${speed} {
        0% { stroke-dashoffset: ${dashLength}px; }
        100% { stroke-dashoffset: 0px; }
      }
    `;

    document.head.appendChild(style);
  };

  // 获取更亮的颜色
  const getBrighterColor = (color: string): string => {
    // 如果是深色，返回更亮的版本
    if (color.toLowerCase() === "#000000" || color.toLowerCase() === "black") {
      return "#3366ff"; // 蓝色
    }
    if (color.toLowerCase() === "#ffffff" || color.toLowerCase() === "white") {
      return "#ffff66"; // 亮黄色
    }

    // 尝试解析十六进制颜色并增加亮度
    const hex = color.replace("#", "");
    if (hex.length === 6) {
      const r = Math.min(255, parseInt(hex.substr(0, 2), 16) + 80);
      const g = Math.min(255, parseInt(hex.substr(2, 2), 16) + 80);
      const b = Math.min(255, parseInt(hex.substr(4, 2), 16) + 80);
      return `rgb(${r}, ${g}, ${b})`;
    }

    return color; // 如果无法解析，返回原色
  };

  // 创建增强的辉光滤镜
  const createEnhancedGlowFilters = (container: SVGGElement) => {
    // 避免重复创建
    if (container.querySelector("#strongGlow")) return;

    let defs = container.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      container.appendChild(defs);
    }

    // 强辉光滤镜
    const strongFilter = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "filter",
    );
    strongFilter.setAttribute("id", "strongGlow");
    strongFilter.setAttribute("x", "-100%");
    strongFilter.setAttribute("y", "-100%");
    strongFilter.setAttribute("width", "300%");
    strongFilter.setAttribute("height", "300%");

    const strongBlur = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "feGaussianBlur",
    );
    strongBlur.setAttribute("stdDeviation", "4");
    strongBlur.setAttribute("result", "coloredBlur");

    const strongMerge = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "feMerge",
    );
    const strongMergeNode1 = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "feMergeNode",
    );
    strongMergeNode1.setAttribute("in", "coloredBlur");
    const strongMergeNode2 = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "feMergeNode",
    );
    strongMergeNode2.setAttribute("in", "SourceGraphic");

    strongMerge.appendChild(strongMergeNode1);
    strongMerge.appendChild(strongMergeNode2);
    strongFilter.appendChild(strongBlur);
    strongFilter.appendChild(strongMerge);

    // 中等辉光滤镜
    const mediumFilter = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "filter",
    );
    mediumFilter.setAttribute("id", "mediumGlow");
    mediumFilter.setAttribute("x", "-75%");
    mediumFilter.setAttribute("y", "-75%");
    mediumFilter.setAttribute("width", "250%");
    mediumFilter.setAttribute("height", "250%");

    const mediumBlur = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "feGaussianBlur",
    );
    mediumBlur.setAttribute("stdDeviation", "3");
    mediumBlur.setAttribute("result", "coloredBlur");

    const mediumMerge = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "feMerge",
    );
    const mediumMergeNode1 = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "feMergeNode",
    );
    mediumMergeNode1.setAttribute("in", "coloredBlur");
    const mediumMergeNode2 = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "feMergeNode",
    );
    mediumMergeNode2.setAttribute("in", "SourceGraphic");

    mediumMerge.appendChild(mediumMergeNode1);
    mediumMerge.appendChild(mediumMergeNode2);
    mediumFilter.appendChild(mediumBlur);
    mediumFilter.appendChild(mediumMerge);

    // 轻度辉光滤镜
    const lightFilter = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "filter",
    );
    lightFilter.setAttribute("id", "lightGlow");
    lightFilter.setAttribute("x", "-50%");
    lightFilter.setAttribute("y", "-50%");
    lightFilter.setAttribute("width", "200%");
    lightFilter.setAttribute("height", "200%");

    const lightBlur = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "feGaussianBlur",
    );
    lightBlur.setAttribute("stdDeviation", "2");
    lightBlur.setAttribute("result", "coloredBlur");

    const lightMerge = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "feMerge",
    );
    const lightMergeNode1 = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "feMergeNode",
    );
    lightMergeNode1.setAttribute("in", "coloredBlur");
    const lightMergeNode2 = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "feMergeNode",
    );
    lightMergeNode2.setAttribute("in", "SourceGraphic");

    lightMerge.appendChild(lightMergeNode1);
    lightMerge.appendChild(lightMergeNode2);
    lightFilter.appendChild(lightBlur);
    lightFilter.appendChild(lightMerge);

    defs.appendChild(strongFilter);
    defs.appendChild(mediumFilter);
    defs.appendChild(lightFilter);
  };

  return (
    <g ref={svgRef}>
      <path
        ref={pathRef}
        d={ArrowUtil.getArrowPath(props)}
        stroke={lineColor}
        strokeWidth={lineWidth}
        fill={"none"}
        strokeDasharray={dashed ? (dashArray || [5, 5]).join(",") : "none"}
        markerEnd={
          targetMarker !== EMarkerType.None
            ? getMarkerUrl(targetMarker)
            : "none"
        }
        markerStart={
          sourceMarker !== EMarkerType.None
            ? getMarkerUrl(sourceMarker)
            : "none"
        }
      />
    </g>
  );
});

export default Arrow;
