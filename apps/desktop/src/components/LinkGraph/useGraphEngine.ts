/**
 * 引擎编排层 —— 把 core 的各块和渲染器接到 React 的生命周期上。
 *
 * 职责边界：本文件只做「事件 → core 调用 → 标记脏 → raf 重绘」的串联，
 * 任何几何、颜色、力学计算都在 core 里（那些才是要单测的部分）。
 *
 * 重绘策略：脏标记 + 单条 raf 循环。布局收敛且无飞行动画时循环自动停摆，
 * 静止的图谱不占 CPU（G6 版一直在跑渲染循环）。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import type { KnowledgeMap } from "@/knowledge-map/types";
import type { ICard } from "@/types";
import { Camera } from "./core/camera";
import type { ClusterInfo } from "./core/cluster";
import { createLayout } from "./core/createLayout";
import { buildScene, inheritPositions, sceneBounds } from "./core/graph";
import { NodePicker } from "./core/hitTest";
import LayoutWorker from "./core/layout.worker?worker";
import type { LayoutHandle } from "./core/layoutTypes";
import { isMapScene, buildMapScene } from "./core/mapScene";
import {
  clusterColor,
  createPalette,
  readThemeTokens,
  resolveBackdrop,
  topicColor,
} from "./core/palette";
import {
  applyPositions,
  createPositionBackend,
  encodeScene,
  recordToMap,
  type PositionBackend,
} from "./core/positionStore";
import type { GraphNode, GraphPalette, GraphScene } from "./core/types";
import { Canvas2DRenderer } from "./renderers/Canvas2DRenderer";

/** 超过这个位移才算拖拽，否则算点击（避免手抖吞掉点击） */
const DRAG_THRESHOLD = 3;
/** 悬停预览的延迟，与内容链接 hover 预览保持一致的手感 */
export const HOVER_DELAY = 300;
/** 落盘坐标命中率低于此值就不沿用（卡片集换了一批，旧布局没有参考价值） */
export const POSITION_REUSE_MIN_COVERAGE = 0.6;
/** 收敛后延迟落盘，避免连续增删卡片时反复写库 */
const PERSIST_DEBOUNCE = 800;

export interface GraphEngineOptions {
  cards: ICard[];
  getCardLinks: (card: ICard) => number[];
  currentCardIds?: number[];
  fitView: boolean;
  fitViewPadding: number;
  enableHoverPreview: boolean;
  /**
   * 坐标持久化的键；不传表示不持久化。
   * 局部子图（某张卡的关联图）与全库图谱节点 id 重叠，必须各用各的键，
   * 或者干脆不存——子图是临时视角，不该覆盖全库那张「地图」。
   */
  persistKey?: string;
  /**
   * 离线知识地图（主进程按「显式链接 + 语义近邻」算好的坐标与主题）。
   * 传了就直接用它的坐标与主题画，不跑力布局与社区发现；不传退回链接图谱。
   */
  knowledgeMap?: KnowledgeMap | null;
  onClickNode?: (card: ICard) => void;
  /**
   * 簇划分算完后回调一次（含主题簇、桥接、孤立卡片、模块度）。
   * 宿主据此做洞见提示；批次 6 的 AI 分析也从这里取上下文。
   */
  onClusters?: (insight: GraphInsight) => void;
  /** 悬停达到延迟后回调，宿主据此挂预览面板；id 为 null 表示收起 */
  onHoverNode?: (payload: { id: number; canvasX: number; canvasY: number } | null) => void;
}

/** 给宿主看的簇信息快照 */
export interface GraphInsight {
  clusters: ClusterInfo[];
  /** 桥接卡片（连接两个及以上主题），按跨簇数降序 */
  bridges: number[];
  isolated: number[];
  scattered: number[];
  /** 0.3 以上算主题结构清晰 */
  modularity: number;
}

export interface GraphEngineHandle {
  containerRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** 布局首轮跑完前宿主显示 Loading */
  ready: boolean;
  /** 把某个节点飞到视口中心（搜索定位、外部聚焦都用它） */
  focusNode: (id: number, scale?: number) => void;
  fitView: () => void;
  /** 悬停节点在画布上的实时位置，供预览面板跟随 */
  anchorOf: (id: number) => { x: number; y: number } | null;
}

export function useGraphEngine(options: GraphEngineOptions): GraphEngineHandle {
  const {
    cards,
    getCardLinks,
    currentCardIds,
    fitView,
    fitViewPadding,
    enableHoverPreview,
    persistKey,
    knowledgeMap,
    onClickNode,
    onClusters,
    onHoverNode,
  } = options;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<Canvas2DRenderer | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const sceneRef = useRef<GraphScene | null>(null);
  const layoutRef = useRef<LayoutHandle | null>(null);
  const pickerRef = useRef<NodePicker | null>(null);
  const paletteRef = useRef<GraphPalette | null>(null);
  /** 簇 id → 颜色；主题或簇划分变化时重算，渲染期不取色 */
  const clusterColorsRef = useRef<Map<number, string>>(new Map());
  const frameRef = useRef(0);
  const dirtyRef = useRef(true);
  const hoveredRef = useRef<number | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentIdsRef = useRef<Set<number>>(new Set());
  const cardsRef = useRef<ICard[]>(cards);
  const fitOnNextSettle = useRef(fitView);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backendRef = useRef<PositionBackend>(undefined as unknown as PositionBackend);
  backendRef.current ??= createPositionBackend();

  const [ready, setReady] = useState(false);

  // 拖拽状态（画布或节点），放 ref 里避免事件里读到过期闭包
  const dragRef = useRef<{
    pointerId: number;
    node: GraphNode | null;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null>(null);

  const currentIdsKey = useMemo(
    () => (currentCardIds ? [...currentCardIds].sort((a, b) => a - b).join(",") : ""),
    [currentCardIds]
  );

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  useEffect(() => {
    currentIdsRef.current = new Set(currentCardIds ?? []);
    dirtyRef.current = true;
  }, [currentIdsKey, currentCardIds]);

  const markDirty = useMemoizedFn(() => {
    dirtyRef.current = true;
  });

  // 宿主常传内联箭头函数；直接进 effect 依赖会让每次渲染都重建场景与布局
  const emitClusters = useMemoizedFn((insight: GraphInsight) => onClusters?.(insight));

  /** 簇色按「锚点 × 底色」算，主题切换或簇划分变化后重建 */
  const rebuildClusterColors = useMemoizedFn(() => {
    const palette = paletteRef.current;
    const scene = sceneRef.current;
    if (!palette || !scene) return;
    const colors = new Map<number, string>();
    for (const cluster of scene.clusters) {
      // 地图模式按离线算好的色槽取色（主题名不变颜色就不变）；链接图谱按锚点哈希到同一套色板
      const slot = isMapScene(scene) ? scene.colorSlots.get(cluster.id) : undefined;
      colors.set(
        cluster.id,
        slot === undefined
          ? clusterColor(cluster.anchor, palette.background)
          : topicColor(slot, palette.background)
      );
    }
    clusterColorsRef.current = colors;
  });

  /** worker 构造器包一层：Vite 的 ?worker 在测试环境下是 mock，起不来就由 createLayout 退回前台 */
  const workerFactory = useMemoizedFn(() => new LayoutWorker());

  const persist = useMemoizedFn((scene: GraphScene) => {
    if (!persistKey) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      void backendRef.current.write(encodeScene(scene, persistKey)).catch(() => {
        // 写不进去只是下次重开要重算布局，不该打断使用
      });
    }, PERSIST_DEBOUNCE);
  });

  const clearHover = useMemoizedFn(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (hoveredRef.current !== null) {
      hoveredRef.current = null;
      dirtyRef.current = true;
    }
    onHoverNode?.(null);
  });

  const drawNow = useMemoizedFn(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const palette = paletteRef.current;
    if (!renderer || !scene || !camera || !palette) return;
    const hoveredId = hoveredRef.current;
    renderer.draw(scene, camera, palette, {
      hoveredId,
      currentIds: currentIdsRef.current,
      adjacentIds: hoveredId === null ? new Set() : (scene.adjacency.get(hoveredId) ?? new Set()),
      clusterColors: clusterColorsRef.current,
    });
  });

  // ---- 构建场景：卡片拓扑变化时重建，坐标从旧场景继承
  const topologyKey = useMemo(() => {
    const ids = new Set(cards.map(card => card.id));
    const parts = cards
      .map(card => {
        const links = [...new Set(getCardLinks(card))]
          .filter(id => ids.has(id) && id !== card.id)
          .sort((a, b) => a - b);
        return `${card.id}:${links.join("-")}`;
      })
      .sort();
    return parts.join("|");
  }, [cards, getCardLinks]);

  useEffect(() => {
    const previous = sceneRef.current;
    const scene = knowledgeMap
      ? buildMapScene(cardsRef.current, getCardLinks, knowledgeMap)
      : buildScene(cardsRef.current, getCardLinks);
    if (previous && !knowledgeMap) inheritPositions(scene, previous);
    sceneRef.current = scene;

    pickerRef.current?.replaceScene(scene);
    pickerRef.current ??= new NodePicker(scene);
    rebuildClusterColors();
    emitClusters({
      clusters: scene.clusters,
      bridges: scene.clusters.flatMap(cluster => cluster.bridges),
      isolated: scene.summary.isolated,
      scattered: scene.summary.scattered,
      modularity: scene.summary.modularity,
    });

    let disposed = false;
    layoutRef.current?.destroy();
    layoutRef.current = null;

    // 离线地图的坐标已经是算好的最终态：不跑布局，直接 fit 显示
    if (knowledgeMap) {
      if (fitView) cameraRef.current?.fit(sceneBounds(scene), fitViewPadding);
      fitOnNextSettle.current = false;
      setReady(true);
      markDirty();
      return () => {
        disposed = true;
      };
    }

    const settle = () => {
      // 收敛后补一次 fit：力模拟跑完的包围盒与种子位置差得远
      if (fitOnNextSettle.current) {
        fitOnNextSettle.current = false;
        cameraRef.current?.fit(sceneBounds(scene), fitViewPadding);
      }
      markDirty();
      persist(scene);
    };

    /**
     * 启动布局。坐标可能来自三处，强度依次递减：
     *  1) 上一版场景（本次会话内增删卡片）——小幅加热；
     *  2) 落盘坐标且覆盖率够——只做很轻的松弛，保持用户熟悉的形状；
     *  3) 都没有——满 alpha 跑一轮，收敛过程本身就是入场动画。
     */
    const begin = (restored: number) => {
      if (disposed) return;
      const layout = createLayout(scene, {
        onTick: markDirty,
        onSettle: settle,
        createWorker: workerFactory,
      });
      layoutRef.current = layout;
      if (previous) layout.reheat(0.4);
      else if (restored >= POSITION_REUSE_MIN_COVERAGE) layout.reheat(0.12);
      else layout.start();
      // 不等收敛就允许显示，否则大图要干等一秒 Loading。
      // 相机的首次 fit 由尺寸同步那一步完成。
      setReady(true);
      markDirty();
    };

    // 落盘坐标是异步读的；首帧先用种子位渲染，读到了再贴回去并重新 fit
    if (!previous && persistKey) {
      backendRef.current
        .read(persistKey)
        .then(record => {
          if (disposed || !record) return begin(0);
          const coverage = applyPositions(scene, recordToMap(record));
          pickerRef.current?.invalidate();
          if (coverage >= POSITION_REUSE_MIN_COVERAGE && fitView) {
            cameraRef.current?.fit(sceneBounds(scene), fitViewPadding);
            fitOnNextSettle.current = false;
          }
          begin(coverage);
        })
        .catch(() => begin(0));
    } else {
      begin(0);
    }

    return () => {
      disposed = true;
      layoutRef.current?.destroy();
      layoutRef.current = null;
    };
    // topologyKey 覆盖 cards + getCardLinks 的有效变化，cards 本体变动（正文编辑）不重建
  }, [
    topologyKey,
    getCardLinks,
    knowledgeMap,
    fitView,
    fitViewPadding,
    emitClusters,
    markDirty,
    persist,
    persistKey,
    rebuildClusterColors,
    workerFactory,
  ]);

  // ---- 主题：解析调色板，并跟随 <html> 的 data-theme / data-mode 变化
  useEffect(() => {
    const apply = () => {
      // 底色取容器往上第一个不透明背景：图谱可能坐在 page 上，也可能在 surface 卡里
      paletteRef.current = createPalette(readThemeTokens(), resolveBackdrop(containerRef.current));
      rebuildClusterColors();
      dirtyRef.current = true;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-mode", "class", "style"],
    });
    return () => observer.disconnect();
  }, [rebuildClusterColors]);

  // ---- 画布尺寸
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    rendererRef.current ??= new Canvas2DRenderer(canvas);
    cameraRef.current ??= new Camera(container.clientWidth, container.clientHeight);

    let lastWidth = 0;
    let lastHeight = 0;
    const sync = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      // 容器还没有尺寸（所在面板折叠、标签页未激活）：此时 fit 会按退化视口
      // 把缩放算到下限，等面板展开也修不回来（fitView=false 的宿主尤其明显）。
      // 直接等 ResizeObserver 的下一次回调。
      if (width === 0 || height === 0) return;
      if (width === lastWidth && height === lastHeight) return;
      lastWidth = width;
      lastHeight = height;
      rendererRef.current?.resize(width, height, window.devicePixelRatio || 1);
      cameraRef.current?.setViewport(width, height);
      if (fitView && sceneRef.current) {
        cameraRef.current?.fit(sceneBounds(sceneRef.current), fitViewPadding);
      }
      dirtyRef.current = true;
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(container);
    return () => observer.disconnect();
  }, [fitView, fitViewPadding]);

  // ---- raf 循环：有脏标记或有飞行动画才画
  useEffect(() => {
    const loop = (now: number) => {
      frameRef.current = requestAnimationFrame(loop);
      const flying = cameraRef.current?.advance(now) ?? false;
      if (!dirtyRef.current && !flying) return;
      dirtyRef.current = false;
      drawNow();
    };
    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current);
  }, [drawNow]);

  // ---- 指针交互
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const localPoint = (event: PointerEvent | WheelEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const pickAt = (canvasX: number, canvasY: number) => {
      const camera = cameraRef.current;
      const picker = pickerRef.current;
      if (!camera || !picker) return null;
      const [worldX, worldY] = camera.toWorld(canvasX, canvasY);
      return picker.pick(worldX, worldY, camera.scale);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const { x, y } = localPoint(event);
      const node = pickAt(x, y);
      dragRef.current = {
        pointerId: event.pointerId,
        node,
        startX: x,
        startY: y,
        lastX: x,
        lastY: y,
        moved: false,
      };
      canvas.setPointerCapture(event.pointerId);
      clearHover();
    };

    const onPointerMove = (event: PointerEvent) => {
      const { x, y } = localPoint(event);
      const drag = dragRef.current;

      if (drag && drag.pointerId === event.pointerId) {
        if (
          !drag.moved &&
          Math.abs(x - drag.startX) < DRAG_THRESHOLD &&
          Math.abs(y - drag.startY) < DRAG_THRESHOLD
        ) {
          return;
        }
        drag.moved = true;
        // 地图模式没有布局在跑：拖节点只会把它从语义位置上扯开、松手也回不去，
        // 所以按在节点上拖动时平移画布（和按在空白处一致）
        if (drag.node && layoutRef.current) {
          const camera = cameraRef.current;
          if (camera) {
            const [worldX, worldY] = camera.toWorld(x, y);
            layoutRef.current.dragTo(drag.node, worldX, worldY);
            pickerRef.current?.invalidate();
          }
        } else {
          cameraRef.current?.panBy(x - drag.lastX, y - drag.lastY);
        }
        drag.lastX = x;
        drag.lastY = y;
        dirtyRef.current = true;
        return;
      }

      const node = pickAt(x, y);
      const nextId = node?.id ?? null;
      if (nextId === hoveredRef.current) return;
      hoveredRef.current = nextId;
      dirtyRef.current = true;
      canvas.style.cursor = nextId === null ? "grab" : "pointer";

      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      if (nextId === null) {
        onHoverNode?.(null);
        return;
      }
      if (!enableHoverPreview) return;
      hoverTimerRef.current = setTimeout(() => {
        hoverTimerRef.current = null;
        if (hoveredRef.current !== nextId) return;
        onHoverNode?.({ id: nextId, canvasX: x, canvasY: y });
      }, HOVER_DELAY);
    };

    const onPointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      if (!drag || drag.pointerId !== event.pointerId) return;

      if (drag.node) {
        // 拖过的节点固定在落点：用户摆过的位置就是他要的位置
        layoutRef.current?.endDrag(drag.node, drag.moved);
        pickerRef.current?.invalidate();
      }
      if (drag.moved) {
        dirtyRef.current = true;
        return;
      }
      // 未位移 = 点击
      if (drag.node) {
        const card = cardsRef.current.find(item => item.id === drag.node!.id);
        if (card) onClickNode?.(card);
      } else {
        clearHover();
      }
    };

    const onPointerLeave = () => {
      if (dragRef.current) return;
      hoveredRef.current = null;
      dirtyRef.current = true;
      clearHover();
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const { x, y } = localPoint(event);
      // deltaY 归一化成指数因子，触控板与滚轮手感一致
      const factor = Math.exp(-event.deltaY * 0.0015);
      cameraRef.current?.zoomAt(x, y, factor);
      pickerRef.current?.invalidate();
      dirtyRef.current = true;
      clearHover();
    };

    canvas.style.cursor = "grab";
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [clearHover, enableHoverPreview, onClickNode, onHoverNode]);

  useEffect(() => {
    if (enableHoverPreview) return;
    clearHover();
  }, [clearHover, enableHoverPreview]);

  useEffect(
    () => () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    },
    []
  );

  const focusNode = useMemoizedFn((id: number, scale = 1.4) => {
    const node = sceneRef.current?.nodeById.get(id);
    if (!node) return;
    cameraRef.current?.flyTo({ x: node.x, y: node.y, scale });
    dirtyRef.current = true;
  });

  const doFitView = useMemoizedFn(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    cameraRef.current?.fit(sceneBounds(scene), fitViewPadding);
    dirtyRef.current = true;
  });

  const anchorOf = useMemoizedFn((id: number) => {
    const node = sceneRef.current?.nodeById.get(id);
    const camera = cameraRef.current;
    if (!node || !camera) return null;
    const [x, y] = camera.toCanvas(node.x, node.y);
    return { x, y: y + node.radius * camera.scale };
  });

  return { containerRef, canvasRef, ready, focusNode, fitView: doFitView, anchorOf };
}
