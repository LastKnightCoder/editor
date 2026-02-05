import { Graph, NodeEvent, CanvasEvent } from "@antv/g6";
import type { NodeData, IElementEvent } from "@antv/g6";
import { useEffect, useRef, useState, memo } from "react";
import classnames from "classnames";
import { useMemoizedFn } from "ahooks";

import { getCardById } from "@/commands";
import useTheme from "@/hooks/useTheme.ts";
import { useThemeColors } from "@/hooks";
import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
  chatReferenceExtension,
} from "@/editor-extensions";
const customExtensions = [
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
  chatReferenceExtension,
];
import { ICard } from "@/types";
import { Editor, EditorRef } from "@tau/editor/src";
import Loading from "@/components/Loading";

/**
 * 使用 BFS 检测图中的连通分量
 * 返回连通分量列表，每个分量包含节点 ID 数组
 */
function findConnectedComponents(
  nodes: { id: string }[],
  edges: { source: string; target: string }[],
): string[][] {
  // 构建邻接表
  const adjacency = new Map<string, Set<string>>();
  nodes.forEach((n) => adjacency.set(n.id, new Set()));
  edges.forEach((e) => {
    adjacency.get(e.source)?.add(e.target);
    adjacency.get(e.target)?.add(e.source);
  });

  // BFS 检测连通分量
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    const queue = [node.id];
    const component: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      adjacency.get(current)?.forEach((neighbor) => {
        if (!visited.has(neighbor)) queue.push(neighbor);
      });
    }
    components.push(component);
  }

  // 按大小降序排序
  components.sort((a, b) => b.length - a.length);
  return components;
}

/**
 * 使用力模拟算法计算簇中心位置
 * 确保不同簇之间不会重叠
 */
function simulateClusterPositions(
  radii: number[],
  width: number,
  height: number,
  iterations = 150,
): { x: number; y: number }[] {
  const count = radii.length;
  if (count === 0) return [];

  // 计算所有簇的总面积，用于估算布局需要的空间
  const totalArea = radii.reduce((sum, r) => sum + Math.PI * r * r, 0);
  const canvasArea = width * height;

  // 如果簇总面积超过画布面积，需要扩展布局范围
  const scaleFactor = Math.max(1, Math.sqrt(totalArea / canvasArea) * 1.5);
  const layoutWidth = width * scaleFactor;
  const layoutHeight = height * scaleFactor;

  // 初始化簇中心位置（使用螺旋布局避免初始重叠）
  const centers: { x: number; y: number; vx: number; vy: number }[] = [];
  const centerX = layoutWidth / 2;
  const centerY = layoutHeight / 2;

  for (let i = 0; i < count; i++) {
    // 螺旋分布初始位置
    const angle = i * 2.39996; // 黄金角度 (约137.5°)
    const spiralRadius = Math.sqrt(i + 1) * 60;
    centers.push({
      x: centerX + spiralRadius * Math.cos(angle),
      y: centerY + spiralRadius * Math.sin(angle),
      vx: 0,
      vy: 0,
    });
  }

  // 力模拟迭代
  const alpha = 0.3; // 学习率
  const alphaDecay = 0.99; // 衰减率
  const velocityDecay = 0.6; // 速度衰减

  let currentAlpha = alpha;

  for (let iter = 0; iter < iterations; iter++) {
    // 计算簇之间的排斥力
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const dx = centers[j].x - centers[i].x;
        const dy = centers[j].y - centers[i].y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;

        // 最小安全距离 = 两个簇的半径之和 + 额外间距
        const minDistance = radii[i] + radii[j] + 50;

        if (distance < minDistance) {
          // 计算排斥力（距离越近力越大）
          const force = ((minDistance - distance) / distance) * currentAlpha;
          const fx = dx * force;
          const fy = dy * force;

          centers[i].vx -= fx;
          centers[i].vy -= fy;
          centers[j].vx += fx;
          centers[j].vy += fy;
        }
      }
    }

    // 向中心的弱吸引力（防止簇散得太开）
    for (let i = 0; i < count; i++) {
      const dx = centerX - centers[i].x;
      const dy = centerY - centers[i].y;
      centers[i].vx += dx * 0.001 * currentAlpha;
      centers[i].vy += dy * 0.001 * currentAlpha;
    }

    // 应用速度并更新位置
    for (let i = 0; i < count; i++) {
      centers[i].x += centers[i].vx;
      centers[i].y += centers[i].vy;
      centers[i].vx *= velocityDecay;
      centers[i].vy *= velocityDecay;

      // 边界约束（软边界）
      const margin = radii[i];
      if (centers[i].x < margin) centers[i].x = margin;
      if (centers[i].x > layoutWidth - margin)
        centers[i].x = layoutWidth - margin;
      if (centers[i].y < margin) centers[i].y = margin;
      if (centers[i].y > layoutHeight - margin)
        centers[i].y = layoutHeight - margin;
    }

    currentAlpha *= alphaDecay;
  }

  // 返回最终位置（归一化到原始画布坐标）
  return centers.map((c) => ({
    x: (c.x / layoutWidth) * width,
    y: (c.y / layoutHeight) * height,
  }));
}

/**
 * 为不同连通分量的节点分配初始位置
 * 根据簇大小动态分配空间，确保簇之间不重叠
 */
function assignInitialPositions(
  components: string[][],
  width: number,
  height: number,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  if (components.length === 0) return positions;

  // 计算每个簇的预估半径（基于节点数量）
  // 大型簇需要更大的空间
  const clusterRadii = components.map((component) => {
    const nodeCount = component.length;
    // 基础半径 + 根据节点数量增长的半径
    // 使用 sqrt 使增长更平缓，避免超大簇占据过多空间
    return Math.sqrt(nodeCount) * 45 + 40;
  });

  // 使用力模拟算法计算簇中心位置
  const clusterCenters = simulateClusterPositions(
    clusterRadii,
    width,
    height,
    150,
  );

  // 为每个簇内的节点分配位置
  components.forEach((component, clusterIndex) => {
    const center = clusterCenters[clusterIndex];
    const radius = clusterRadii[clusterIndex];

    if (component.length === 1) {
      // 单节点簇直接放在中心
      positions.set(component[0], { x: center.x, y: center.y });
    } else if (component.length === 2) {
      // 双节点簇水平排列
      const offset = 40;
      positions.set(component[0], { x: center.x - offset, y: center.y });
      positions.set(component[1], { x: center.x + offset, y: center.y });
    } else {
      // 多节点簇使用螺旋分布
      // 螺旋参数：从中心向外扩展
      component.forEach((nodeId, nodeIndex) => {
        // 使用黄金角度螺旋分布，这样节点分布更均匀
        const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // 约137.5°
        const angle = nodeIndex * goldenAngle;
        // 半径从中心向外递增，使用 sqrt 使分布更均匀
        const r = Math.sqrt((nodeIndex + 1) / component.length) * radius * 0.85;

        positions.set(nodeId, {
          x: center.x + r * Math.cos(angle),
          y: center.y + r * Math.sin(angle),
        });
      });
    }
  });

  return positions;
}

interface ILinkGraphProps {
  initCards: ICard[];
  getCardLinks?: (card: ICard) => number[];
  className?: string;
  style?: React.CSSProperties;
  cardWidth?: number;
  cardMaxHeight?: number;
  cardFontSize?: number;
  currentCardIds?: number[];
  fitView?: boolean;
  fitViewPadding?: number[];
  onClickCard?: (card: ICard) => void;
}

const defaultFitViewPadding = [40];
const defaultGetCardLinks = (card: ICard) => card.links;

const LinkGraph = memo((props: ILinkGraphProps) => {
  const {
    className,
    style,
    initCards,
    cardWidth,
    cardMaxHeight,
    cardFontSize,
    currentCardIds,
    getCardLinks = defaultGetCardLinks,
    fitView = true,
    fitViewPadding = defaultFitViewPadding,
    onClickCard,
  } = props;

  const [isAfterLayout, setIsAfterLayout] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver>();
  const graph = useRef<Graph>();
  const editorRef = useRef<EditorRef>(null);
  const initCardsRef = useRef<ICard[]>(initCards);
  const prevSize = useRef<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const mouseEnterId = useRef<string>();

  const [show, setShow] = useState<boolean>(false);
  const [position, setPosition] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [activeId, setActiveId] = useState<number>(-1);
  const { isDark } = useTheme();
  const {
    graphNodeFill,
    graphNodeStroke,
    graphEdgeStroke,
    graphNodeFillDark,
    graphNodeStrokeDark,
    graphEdgeStrokeDark,
    graphNodeSelectedFill,
    graphNodeSelectedStroke,
    graphNodeCurrentFill,
    graphNodeCurrentStroke,
  } = useThemeColors();

  const handleNodeMouseEnter = useMemoizedFn((evt: IElementEvent) => {
    if (!graph.current || !isAfterLayout) return;

    const target = evt.target;
    if (!target || !target.id) return;

    const id = target.id as string;
    mouseEnterId.current = id;

    setTimeout(() => {
      if (!ref.current || mouseEnterId.current !== id || !graph.current) return;

      // 检查节点是否已经是选中状态
      const states = graph.current.getElementState(id);
      const isSelected = states.includes("selected");
      if (!isSelected) {
        // 清除其他节点的选中状态
        const allNodes = graph.current.getNodeData();
        const stateUpdates: Record<string, string[]> = {};
        allNodes.forEach((node: NodeData) => {
          if (node.id !== id) {
            const currentStates = graph.current!.getElementState(node.id);
            // 只清除 selected 状态，保留 current 状态
            stateUpdates[node.id] = currentStates.filter(
              (s: string) => s !== "selected",
            );
          }
        });
        if (Object.keys(stateUpdates).length > 0) {
          graph.current.setElementState(stateUpdates);
        }
        // 设置当前节点为选中状态，同时保留 current 状态
        const currentNodeStates = graph.current.getElementState(id);
        const newStates = currentNodeStates.includes("current")
          ? ["selected", "current"]
          : ["selected"];
        graph.current.setElementState(id, newStates);
      }

      // 获取位置 - 使用类型断言访问 client 属性
      const clientPos = (evt as unknown as { client: { x: number; y: number } })
        .client;
      const x = clientPos?.x ?? 0;
      const y = clientPos?.y ?? 0;
      // 获取容器偏移量
      const { top, left } = ref.current.getBoundingClientRect();
      setShow(true);
      setPosition({ x: x - left + 10, y: y - top + 10 });
      setActiveId(Number(id));
      getCardById(Number(id)).then((card) => {
        if (editorRef.current) {
          editorRef.current.setEditorValue(card.content);
        }
      });
    }, 300);
  });

  const handleNodeMouseLeave = useMemoizedFn(() => {
    mouseEnterId.current = undefined;
  });

  const handleNodeClick = useMemoizedFn((evt: IElementEvent) => {
    if (
      !ref.current ||
      !isAfterLayout ||
      !graph.current ||
      !initCardsRef.current
    ) {
      return;
    }
    const target = evt.target;
    if (!target || !target.id) return;
    const id = target.id as string;
    if (onClickCard) {
      const card = initCardsRef.current.find((card) => card.id === Number(id));
      if (card) {
        onClickCard(card);
      }
    }
    if (activeId === Number(id)) {
      setActiveId(-1);
      setShow(false);
      const currentStates = graph.current.getElementState(id);
      graph.current.setElementState(
        id,
        currentStates.filter((s: string) => s !== "selected"),
      );
    }
  });

  const handleCanvasClick = useMemoizedFn(() => {
    if (!graph.current || !isAfterLayout) return;
    // 清除所有节点的选中状态
    const allNodes = graph.current.getNodeData();
    const stateUpdates: Record<string, string[]> = {};
    allNodes.forEach((node: NodeData) => {
      const currentStates = graph.current!.getElementState(node.id);
      // 只清除 selected 状态，保留 current 状态
      stateUpdates[node.id] = currentStates.filter(
        (s: string) => s !== "selected",
      );
    });
    if (Object.keys(stateUpdates).length > 0) {
      graph.current.setElementState(stateUpdates);
    }
    setShow(false);
    setActiveId(-1);
  });

  const handleInitialize = useMemoizedFn(
    (
      cards: ICard[],
      isDark: boolean,
      fitViewPadding: number[],
      graphNodeFill: string,
      graphNodeStroke: string,
      graphEdgeStroke: string,
      graphNodeFillDark: string,
      graphNodeStrokeDark: string,
      graphEdgeStrokeDark: string,
      graphNodeSelectedFill: string,
      graphNodeSelectedStroke: string,
      graphNodeCurrentFill: string,
      graphNodeCurrentStroke: string,
    ) => {
      if (!ref.current) return;
      setIsAfterLayout(false);
      const width = ref.current.clientWidth;
      const height = ref.current.clientHeight;
      if (graph.current) {
        graph.current.destroy();
      }
      graph.current = new Graph({
        container: ref.current,
        width,
        height,
        autoFit: fitView ? "view" : undefined,
        padding: fitViewPadding,
        animation: false,
        node: {
          type: "circle",
          style: {
            fill: graphNodeCurrentFill,
            stroke: graphNodeCurrentStroke,
            lineWidth: 6,
          },
          state: {
            selected: {
              fill: graphNodeSelectedFill,
              stroke: graphNodeSelectedStroke,
              lineWidth: 8,
            },
            current: {
              fill: isDark ? graphNodeFillDark : graphNodeFill,
              stroke: isDark ? graphNodeStrokeDark : graphNodeStroke,
              lineWidth: 8,
            },
          },
        },
        edge: {
          type: "line",
          style: {
            stroke: isDark ? graphEdgeStrokeDark : graphEdgeStroke,
            lineWidth: 8,
          },
        },
        layout: {
          type: "d3-force",
          link: {
            distance: 100,
            strength: 0.6,
          },
          manyBody: {
            strength: -300, // 增强排斥力，确保节点之间保持距离
            distanceMax: 650, // 增加排斥力作用距离，影响更远的节点
          },
          collide: {
            radius: (node: NodeData) => {
              const card = cards.find((c) => String(c.id) === node.id);
              const size = card
                ? Math.min(getCardLinks(card).length * 10 + 30, 80)
                : 30;
              return size / 2 + 25; // 增加安全边距，防止节点过于接近
            },
            strength: 1,
            iterations: 4, // 增加碰撞检测迭代次数，更好地解决重叠
          },
          center: {
            strength: 0.005, // 降低中心吸引力，让簇更自然地分布
          },
        },
        behaviors: ["drag-canvas", "zoom-canvas"],
      });
      // 创建节点 ID 集合，用于过滤无效边
      const nodeIdSet = new Set(cards.map((card) => String(card.id)));

      // 先创建基础节点数据（用于连通分量检测）
      const basicNodes = cards.map((card) => ({
        id: String(card.id),
      }));

      // 过滤掉 target 节点不存在的边
      const edges = cards
        .map((card) =>
          getCardLinks(card)
            .filter((link) => nodeIdSet.has(String(link)))
            .map((link) => ({
              source: String(card.id),
              target: String(link),
            })),
        )
        .flat();

      // 检测连通分量并分配初始位置
      const components = findConnectedComponents(basicNodes, edges);
      const initialPositions = assignInitialPositions(
        components,
        width,
        height,
      );

      // 为节点添加初始位置
      const nodes = cards.map((card) => {
        const nodeId = String(card.id);
        const pos = initialPositions.get(nodeId);
        return {
          id: nodeId,
          style: {
            size: Math.min(getCardLinks(card).length * 10 + 30, 80),
            x: pos?.x,
            y: pos?.y,
          },
        };
      });

      graph.current.setData({
        nodes,
        edges,
      });

      graph.current.render();

      graph.current.once("afterrender", () => {
        setIsAfterLayout(true);
      });

      graph.current.on(NodeEvent.POINTER_ENTER, handleNodeMouseEnter);
      graph.current.on(NodeEvent.POINTER_LEAVE, handleNodeMouseLeave);

      graph.current.on(NodeEvent.CLICK, handleNodeClick);
      graph.current.on(CanvasEvent.CLICK, handleCanvasClick);
    },
  );

  const handleCurrentCardIdsChange = useMemoizedFn(
    (currentCardIds: number[] | undefined, isAfterLayout?: boolean) => {
      if (!graph.current || !isAfterLayout) return;
      try {
        // 获取当前处于 current 状态的节点
        const currentNodeData = graph.current.getElementDataByState(
          "node",
          "current",
        );
        // 清除这些节点的 current 状态
        currentNodeData.forEach((nodeData: NodeData) => {
          if (!graph.current) return;
          try {
            const currentStates = graph.current.getElementState(nodeData.id);
            const newStates = currentStates.filter(
              (s: string) => s !== "current",
            );
            graph.current.setElementState(nodeData.id, newStates);
          } catch {
            // 忽略元素未准备好的错误
          }
        });
        // 设置新的 current 状态
        // 获取所有节点 ID 用于检查节点是否存在
        const allNodeIds = new Set(
          graph.current.getNodeData().map((n: NodeData) => n.id),
        );
        currentCardIds?.forEach((id) => {
          if (!graph.current) return;
          const nodeId = String(id);
          // 检查节点是否存在于图中
          if (!allNodeIds.has(nodeId)) return;
          try {
            const currentStates = graph.current.getElementState(nodeId);
            if (!currentStates.includes("current")) {
              graph.current.setElementState(nodeId, [
                ...currentStates,
                "current",
              ]);
            }
          } catch {
            // 忽略元素未准备好的错误
          }
        });
      } catch {
        // 忽略图未准备好的错误
      }
    },
  );

  useEffect(() => {
    handleInitialize(
      initCardsRef.current,
      isDark,
      fitViewPadding,
      graphNodeFill,
      graphNodeStroke,
      graphEdgeStroke,
      graphNodeFillDark,
      graphNodeStrokeDark,
      graphEdgeStrokeDark,
      graphNodeSelectedFill,
      graphNodeSelectedStroke,
      graphNodeCurrentFill,
      graphNodeCurrentStroke,
    );

    return () => {
      if (graph.current) graph.current.destroy();
      graph.current = undefined;
    };
  }, [
    handleInitialize,
    isDark,
    fitViewPadding,
    graphNodeFill,
    graphNodeStroke,
    graphEdgeStroke,
    graphNodeFillDark,
    graphNodeStrokeDark,
    graphEdgeStrokeDark,
    graphNodeSelectedFill,
    graphNodeSelectedStroke,
    graphNodeCurrentFill,
    graphNodeCurrentStroke,
  ]);

  useEffect(() => {
    handleCurrentCardIdsChange(currentCardIds, isAfterLayout);
  }, [currentCardIds, handleCurrentCardIdsChange, isAfterLayout]);

  useEffect(() => {
    if (!graph.current || !ref.current || activeId === -1 || !isAfterLayout)
      return;

    const handleGraphZoomAndMove = () => {
      if (!graph.current || !ref.current) return;
      // 获取节点数据
      const nodeData = graph.current.getNodeData(String(activeId));
      if (!nodeData) {
        return;
      }
      // 获取节点的渲染位置
      const nodeStyle = nodeData.style || {};
      const x = nodeStyle.x as number | undefined;
      const y = nodeStyle.y as number | undefined;
      if (x === undefined || y === undefined) return;
      const { top, left } = ref.current.getBoundingClientRect();
      // 获取节点尺寸
      const size = (nodeStyle.size as number) || 30;
      // 获取画布的缩放比例
      const ratio = graph.current.getZoom();
      const actualSize = size * ratio;
      // 将画布坐标转换为视口坐标
      const viewportPoint = graph.current.getViewportByCanvas([x, y]);
      setPosition({
        x: viewportPoint[0] - left + actualSize / 2,
        y: viewportPoint[1] - top + actualSize / 2,
      });
    };

    // 图面缩放和移动时重新设置位置
    graph.current.on("canvas:drag", handleGraphZoomAndMove);
    graph.current.on("wheel", handleGraphZoomAndMove);

    return () => {
      if (!graph.current) return;
      graph.current.off("canvas:drag", handleGraphZoomAndMove);
      graph.current.off("wheel", handleGraphZoomAndMove);
    };
  }, [activeId, isAfterLayout]);

  return (
    <div
      className={classnames("w-full relative overflow-hidden", className)}
      style={style}
      ref={(node) => {
        if (node) {
          ref.current = node;
          if (resizeObserverRef.current) {
            resizeObserverRef.current.disconnect();
          }
          resizeObserverRef.current = new ResizeObserver(() => {
            if (graph.current) {
              const width = node.clientWidth;
              const height = node.clientHeight;
              if (
                prevSize.current.width === width &&
                prevSize.current.height === height
              ) {
                return;
              }
              graph.current.setSize(width, height);
              graph.current.fitView();
              prevSize.current = { width, height };
            }
          });
          resizeObserverRef.current.observe(node);
        }
      }}
    >
      {!isAfterLayout && (
        <div className="w-full h-full flex justify-center items-center">
          <Loading />
        </div>
      )}
      {show && (
        <div
          className="absolute rounded-[18px] bg-[rgba(248,250,255,0.9)] dark:bg-[rgba(10,15,28,0.85)] border border-[rgba(255,255,255,0.45)] dark:border-[rgba(255,255,255,0.12)] shadow-[0_18px_45px_rgba(15,23,42,0.25)] dark:shadow-[0_22px_60px_rgba(2,6,23,0.7)] backdrop-blur-[18px] backdrop-saturate-180 text-[rgba(15,23,42,0.95)] dark:text-[rgba(241,245,249,0.95)] animate-fadeIn"
          style={{
            left: position.x,
            top: position.y,
            width: cardWidth,
            maxHeight: cardMaxHeight,
            fontSize: cardFontSize,
          }}
        >
          <div
            className="border-l-20 border-r-8 border-y-20 px-2-5 border-transparent overflow-y-auto w-[420px] max-h-[360px]"
            style={{
              maxWidth: cardWidth,
              paddingRight: 12,
            }}
          >
            <Editor
              ref={editorRef}
              readonly={true}
              extensions={customExtensions}
            />
          </div>
        </div>
      )}
    </div>
  );
});

export default LinkGraph;
