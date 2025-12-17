import { v4 as uuid } from "uuid";
import { MindMapNodeData } from "@/components/MindMap/types";
import { BoardElement } from "@/components/WhiteBoard/types/board";
import { ArrowElement, EArrowLineType, EMarkerType } from "@/components/WhiteBoard/types/arrow";
import { Descendant } from "slate";

const HORIZONTAL_SPACING = 200;
const VERTICAL_SPACING = 80;
const NODE_MIN_WIDTH = 120;
const NODE_HEIGHT = 60;

/**
 * 将 Slate Descendant 转换为纯文本
 */
function descendantsToText(descendants: Descendant[]): string {
  return descendants
    .map((node: any) => {
      if (node.type === "paragraph" && node.children) {
        return node.children
          .map((child: any) => child.text || "")
          .join("");
      }
      return "";
    })
    .join("\n");
}

/**
 * 估算文本宽度（简单估算）
 */
function estimateTextWidth(text: string): number {
  // 假设每个字符平均宽度为 14px，加上左右 padding
  const baseWidth = text.length * 14;
  return Math.max(NODE_MIN_WIDTH, Math.min(baseWidth + 40, 300));
}

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: Descendant[];
  children: LayoutNode[];
  direction: "left" | "right";
}

/**
 * 递归计算节点的子树高度
 */
function calculateSubtreeHeight(node: LayoutNode): number {
  if (node.children.length === 0) {
    return node.height;
  }

  const childrenHeights = node.children.map(child => calculateSubtreeHeight(child));
  const totalChildrenHeight = childrenHeights.reduce((sum, h) => sum + h, 0);
  const spacingHeight = (node.children.length - 1) * VERTICAL_SPACING;

  return Math.max(node.height, totalChildrenHeight + spacingHeight);
}

/**
 * 递归布局思维导图节点
 */
function layoutMindMap(
  node: MindMapNodeData,
  x: number,
  y: number,
  direction: "left" | "right",
  level: number
): LayoutNode {
  const text = descendantsToText(node.text);
  const width = estimateTextWidth(text);

  const layoutNode: LayoutNode = {
    id: node.id,
    x,
    y,
    width,
    height: NODE_HEIGHT,
    text: node.text,
    children: [],
    direction,
  };

  if (!node.children || node.children.length === 0) {
    return layoutNode;
  }

  // 根节点的子节点可能分布在左右两侧
  if (level === 1) {
    const leftChildren = node.children.filter(child => child.direction === "left");
    const rightChildren = node.children.filter(child => child.direction !== "left");

    let currentY = y;

    // 布局右侧子节点
    rightChildren.forEach(child => {
      const childLayout = layoutMindMap(
        child,
        x + width + HORIZONTAL_SPACING,
        currentY,
        "right",
        level + 1
      );
      layoutNode.children.push(childLayout);
      currentY += calculateSubtreeHeight(childLayout) + VERTICAL_SPACING;
    });

    // 布局左侧子节点
    currentY = y;
    leftChildren.forEach(child => {
      const childWidth = estimateTextWidth(descendantsToText(child.text));
      const childLayout = layoutMindMap(
        child,
        x - HORIZONTAL_SPACING - childWidth,
        currentY,
        "left",
        level + 1
      );
      layoutNode.children.push(childLayout);
      currentY += calculateSubtreeHeight(childLayout) + VERTICAL_SPACING;
    });

    // 调整根节点垂直居中
    if (layoutNode.children.length > 0) {
      const totalHeight = calculateSubtreeHeight(layoutNode);
      layoutNode.y = y + (totalHeight - NODE_HEIGHT) / 2;
    }
  } else {
    // 非根节点，所有子节点继承父节点方向
    let currentY = y;

    node.children.forEach(child => {
      const nextX = direction === "right"
        ? x + width + HORIZONTAL_SPACING
        : x - HORIZONTAL_SPACING - estimateTextWidth(descendantsToText(child.text));

      const childLayout = layoutMindMap(
        child,
        nextX,
        currentY,
        direction,
        level + 1
      );
      layoutNode.children.push(childLayout);
      currentY += calculateSubtreeHeight(childLayout) + VERTICAL_SPACING;
    });

    // 调整当前节点垂直居中
    if (layoutNode.children.length > 0) {
      const totalHeight = calculateSubtreeHeight(layoutNode);
      layoutNode.y = y + (totalHeight - NODE_HEIGHT) / 2;
    }
  }

  return layoutNode;
}

/**
 * 将布局节点转换为白板元素
 */
function layoutNodeToBoardElements(
  node: LayoutNode,
  elements: BoardElement[],
  arrows: ArrowElement[],
  level: number
): void {
  // 创建几何图形节点
  const geometryElement: any = {
    id: node.id,
    type: "geometry",
    geometryType: "rectangle",
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    fill: level === 1 ? "#4CAF50" : "#E3F2FD",
    stroke: level === 1 ? "#388E3C" : "#2196F3",
    strokeWidth: 2,
    paths: ["M 0 0 H 1 V 1 H 0 Z"],
    text: {
      align: "center",
      content: node.text,
    },
  };

  elements.push(geometryElement);

  // 为每个子节点创建箭头
  node.children.forEach(child => {
    const arrow: ArrowElement = {
      id: uuid(),
      type: "arrow",
      lineType: EArrowLineType.CURVE,
      source: {
        marker: EMarkerType.None,
        bindId: node.id,
        connectId: child.direction === "left" ? "left" : "right",
      },
      target: {
        marker: EMarkerType.Arrow,
        bindId: child.id,
        connectId: child.direction === "left" ? "right" : "left",
      },
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
      lineColor: level === 1 ? "#4CAF50" : "#2196F3",
      lineWidth: 2,
      dashed: false,
    };

    arrows.push(arrow);

    // 递归处理子节点
    layoutNodeToBoardElements(child, elements, arrows, level + 1);
  });
}

/**
 * 将思维导图数据转换为白板元素
 */
export function convertMindMapToBoard(data: MindMapNodeData): BoardElement[] {
  const elements: BoardElement[] = [];
  const arrows: ArrowElement[] = [];

  // 从 (0, 0) 开始布局
  const layoutRoot = layoutMindMap(data, 0, 0, "right", 1);

  // 转换为白板元素
  layoutNodeToBoardElements(layoutRoot, elements, arrows, 1);

  // 箭头放在最后，这样渲染时会在节点上方
  return [...elements, ...arrows];
}
