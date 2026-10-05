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
import { Camera } from "./core/camera";
import { clusterGeometry } from "./core/clusterGeometry";
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
import { buildTimeline, revealAt, shownCount, timeAt, type Timeline } from "./core/timeline";
import type { GraphNode, GraphPalette, GraphScene, GraphItem } from "./core/types";
import {
  Canvas2DRenderer,
  MAP_CARD_LABEL_SCALE,
  MAP_SUBTOPIC_LABEL_SCALE,
  type Box,
} from "./renderers/Canvas2DRenderer";

/** 超过这个位移才算拖拽，否则算点击（避免手抖吞掉点击） */
const DRAG_THRESHOLD = 3;
/** 悬停预览的延迟，与内容链接 hover 预览保持一致的手感 */
export const HOVER_DELAY = 300;
/** 播放状态同步给 React 的最小间隔：日期与张数不需要 60fps 地重渲染整个壳 */
const PLAYBACK_UI_INTERVAL = 100;

/** 落盘坐标命中率低于此值就不沿用（卡片集换了一批，旧布局没有参考价值） */
export const POSITION_REUSE_MIN_COVERAGE = 0.6;
/**
 * 悬停降淡的渐变时长。鼠标在密集节点上扫过时悬停频繁开关，硬切会整屏频闪；
 * 太长又显得迟钝。在两个节点间直接换指向时不经过 0，只换中心。
 */
export const EMPHASIS_FADE_MS = 120;
/** 收敛后延迟落盘，避免连续增删卡片时反复写库 */
const PERSIST_DEBOUNCE = 800;

export interface GraphEngineOptions {
  items: GraphItem[];
  /** 当前卡片（通常一两张）：accent 强调 */
  currentCardIds?: number[];
  /** 筛选命中；null / 不传表示没有筛选。命中的保持主题色，未命中的降淡 */
  filterCardIds?: number[] | null;
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
  onClickNode?: (item: GraphItem) => void;
  /**
   * 簇划分算完后回调一次（含主题簇、桥接、孤立卡片、模块度）。
   * 宿主据此做洞见提示；批次 6 的 AI 分析也从这里取上下文。
   */
  onClusters?: (insight: GraphInsight) => void;
  /**
   * 悬停达到延迟后回调，宿主据此挂预览面板；id 为 null 表示收起。
   * box 是节点圆连同其标题的占位框（画布坐标），面板须避开它，否则会盖住节点没法点
   */
  onHoverNode?: (payload: { id: number; box: Box } | null) => void;
  /**
   * 指针离开画布时，去往的元素若返回 true 就保持悬停（宿主用来放行自己的预览面板）。
   * 保持期间悬停的结束由宿主调 clearHover 决定
   */
  keepHoverOnLeave?: (target: EventTarget | null) => boolean;
}

/**
 * 入场动画的状态快照。动画是「看」不是「查」：没有暂停、进度、倍速，
 * 开始后直接播完（时长按卡片数取对数封顶，不会播很久），只能中途跳到结尾。
 */
export interface PlaybackState {
  /** 是否正在播；false 时图谱是完整的静态图 */
  active: boolean;
  /** 已出现的卡片数 / 总数 */
  shown: number;
  total: number;
  /** 当前播到的创建时间（毫秒时间戳） */
  time: number;
}

export interface PlaybackControls {
  state: PlaybackState;
  /** 从头播放 */
  play: () => void;
  /** 跳到结尾：立即显示完整的图 */
  stop: () => void;
}

const IDLE_PLAYBACK: PlaybackState = { active: false, shown: 0, total: 0, time: 0 };

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

/** 画布坐标里的一个圆（主题岛）：x、y 为圆心，radius 为半径（都已乘相机缩放） */
export interface CanvasCircle {
  x: number;
  y: number;
  radius: number;
}

/**
 * 覆盖层用的坐标换算：宿主在画布上叠自己的 DOM / SVG（如 AI 洞见的标记），
 * 每帧（平移、缩放、飞行后）重新取位置。都返回画布坐标，取不到为 null。
 */
export interface GraphOverlayApi {
  /** 每次重绘后回调；返回取消订阅 */
  subscribeFrame: (listener: () => void) => () => void;
  /** 节点（按条目 key，如 "card:12"）的画布位置与此刻画出来的半径 */
  project: (key: string) => { x: number; y: number; r: number } | null;
  /** 地图大主题（地图里的主题 id）的岛 */
  topicShape: (topicId: number) => CanvasCircle | null;
  /** 地图子主题的成员中心 */
  subtopicCenter: (subtopicId: number) => { x: number; y: number } | null;
  /** 当前缩放；主题名在 scale ≥ subtopicLabelScale 时挪到岛的上沿 */
  scale: () => number;
  subtopicLabelScale: number;
  /** scale ≥ 它时地图自己画出节点标题 */
  nodeLabelScale: number;
  /** 镜头飞到某个主题，让它占满视口的大半 */
  flyToTopic: (topicId: number) => void;
  /** 镜头回到全图 */
  flyToAll: () => void;
  /** 让这几个节点都进入视口：都在视口里时不动，放不下时拉远，不会拉近 */
  flyToItems: (keys: string[]) => void;
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
  /** 结束悬停（收起预览、撤掉高亮） */
  clearHover: () => void;
  /** 按创建时间的入场播放 */
  playback: PlaybackControls;
  overlay: GraphOverlayApi;
}

export function useGraphEngine(options: GraphEngineOptions): GraphEngineHandle {
  const {
    items,
    currentCardIds,
    filterCardIds,
    fitView,
    fitViewPadding,
    enableHoverPreview,
    persistKey,
    knowledgeMap,
    onClickNode,
    onClusters,
    onHoverNode,
    keepHoverOnLeave,
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
  const frameListenersRef = useRef(new Set<() => void>());
  const geometryCacheRef = useRef<{
    scene: GraphScene;
    shapes: ReturnType<typeof clusterGeometry>;
  } | null>(null);
  const hoveredRef = useRef<number | null>(null);
  /** 降淡的中心与强调程度：悬停结束后中心保留到淡出完成 */
  const focusRef = useRef<number | null>(null);
  const emphasisRef = useRef(0);
  const emphasisTimeRef = useRef(0);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentIdsRef = useRef<Set<number>>(new Set());
  const filterIdsRef = useRef<Set<number> | null>(null);
  const itemsRef = useRef<GraphItem[]>(items);
  const fitOnNextSettle = useRef(fitView);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backendRef = useRef<PositionBackend>(undefined as unknown as PositionBackend);
  backendRef.current ??= createPositionBackend();

  const [ready, setReady] = useState(false);

  // ---- 入场播放：逐帧状态放 ref（raf 里读写），React state 只做节流后的快照给控件
  const playbackRef = useRef<{
    timeline: Timeline;
    progress: number;
    lastTime: number;
  } | null>(null);
  const revealRef = useRef<Map<number, number> | null>(null);
  const playbackSyncRef = useRef(0);
  const [playbackState, setPlaybackState] = useState<PlaybackState>(IDLE_PLAYBACK);

  const syncPlayback = useMemoizedFn((force = false) => {
    const session = playbackRef.current;
    if (!session) {
      setPlaybackState(IDLE_PLAYBACK);
      return;
    }
    const now = performance.now();
    if (!force && now - playbackSyncRef.current < PLAYBACK_UI_INTERVAL) return;
    playbackSyncRef.current = now;
    setPlaybackState({
      active: true,
      shown: shownCount(session.timeline, session.progress),
      total: session.timeline.order.length,
      time: timeAt(session.timeline, session.progress),
    });
  });

  const applyProgress = useMemoizedFn((progress: number) => {
    const session = playbackRef.current;
    if (!session) return;
    session.progress = Math.min(1, Math.max(0, progress));
    revealRef.current = revealAt(session.timeline, session.progress);
    dirtyRef.current = true;
  });

  const stopPlayback = useMemoizedFn(() => {
    if (!playbackRef.current) return;
    playbackRef.current = null;
    revealRef.current = null;
    dirtyRef.current = true;
    syncPlayback(true);
  });

  const play = useMemoizedFn(() => {
    const scene = sceneRef.current;
    if (!scene || scene.nodes.length === 0) return;
    playbackRef.current = { timeline: buildTimeline(scene.nodes), progress: 0, lastTime: 0 };
    clearHover();
    applyProgress(0);
    syncPlayback(true);
  });

  /** 推进播放进度；还在播返回 true，raf 循环据此继续画 */
  const advancePlayback = useMemoizedFn((now: number) => {
    const session = playbackRef.current;
    if (!session) return false;
    const last = session.lastTime || now;
    session.lastTime = now;
    const step = (now - last) / session.timeline.duration;
    applyProgress(session.progress + step);
    if (session.progress >= 1) {
      // 播完即回到完整的静态图：不留一个停在 100% 的「会话」，图谱交互照常
      stopPlayback();
      return false;
    }
    syncPlayback();
    return true;
  });

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
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    currentIdsRef.current = new Set(currentCardIds ?? []);
    dirtyRef.current = true;
  }, [currentIdsKey, currentCardIds]);

  const filterIdsKey = useMemo(
    () => (filterCardIds ? [...filterCardIds].sort((a, b) => a - b).join(",") : null),
    [filterCardIds]
  );

  useEffect(() => {
    filterIdsRef.current = filterCardIds ? new Set(filterCardIds) : null;
    dirtyRef.current = true;
  }, [filterIdsKey, filterCardIds]);

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
      // 地图模式按离线算好的色槽取色（主题名不变颜色就不变），没有色槽的（兜底）
      // 由渲染器回落到中性节点色；链接图谱按锚点哈希到同一套色板
      if (isMapScene(scene)) {
        const slot = scene.colorSlots.get(cluster.id);
        if (slot !== undefined) colors.set(cluster.id, topicColor(slot, palette.background));
        continue;
      }
      colors.set(cluster.id, clusterColor(cluster.anchor, palette.background));
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
    const focusId = focusRef.current;
    renderer.draw(scene, camera, palette, {
      hoveredId,
      focusId,
      emphasis: emphasisRef.current,
      currentIds: currentIdsRef.current,
      filterIds: filterIdsRef.current,
      reveal: revealRef.current,
      adjacentIds: focusId === null ? new Set() : (scene.adjacency.get(focusId) ?? new Set()),
      clusterColors: clusterColorsRef.current,
    });
    for (const listener of frameListenersRef.current) listener();
  });

  /** 推进悬停强调的渐变；还没到终点返回 true，raf 循环据此继续画 */
  const advanceEmphasis = useMemoizedFn((now: number) => {
    const hovered = hoveredRef.current;
    if (hovered !== null) focusRef.current = hovered;
    const target = hovered === null ? 0 : 1;
    const last = emphasisTimeRef.current || now;
    emphasisTimeRef.current = now;
    const current = emphasisRef.current;
    if (current === target) {
      if (target === 0) focusRef.current = null;
      emphasisTimeRef.current = 0;
      return false;
    }
    const step = (now - last) / EMPHASIS_FADE_MS;
    const next = target > current ? Math.min(1, current + step) : Math.max(0, current - step);
    emphasisRef.current = next;
    if (next === 0) focusRef.current = null;
    return true;
  });

  // ---- 构建场景：卡片拓扑变化时重建，坐标从旧场景继承
  const topologyKey = useMemo(() => {
    const ids = new Set(items.map(item => item.id));
    const parts = items
      .map(item => {
        const links = [...new Set(item.links)]
          .filter(id => ids.has(id) && id !== item.id)
          .sort((a, b) => a - b);
        return `${item.key}:${item.id}:${links.join("-")}`;
      })
      .sort();
    return parts.join("|");
  }, [items]);

  useEffect(() => {
    const previous = sceneRef.current;
    const scene = knowledgeMap
      ? buildMapScene(itemsRef.current, knowledgeMap)
      : buildScene(itemsRef.current);
    if (previous && !knowledgeMap) inheritPositions(scene, previous);
    sceneRef.current = scene;
    // 卡片集变了，旧时间轴对不上新节点：结束播放，回到完整的图
    stopPlayback();

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
    // topologyKey 覆盖条目与连线的有效变化，条目本体变动（标题编辑）不重建
  }, [
    topologyKey,
    knowledgeMap,
    fitView,
    fitViewPadding,
    emitClusters,
    markDirty,
    persist,
    persistKey,
    rebuildClusterColors,
    stopPlayback,
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
      const fading = advanceEmphasis(now);
      const playing = advancePlayback(now);
      if (!dirtyRef.current && !flying && !fading && !playing) return;
      dirtyRef.current = false;
      drawNow();
    };
    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current);
  }, [advanceEmphasis, advancePlayback, drawNow]);

  const anchorOf = useMemoizedFn((id: number) => {
    const node = sceneRef.current?.nodeById.get(id);
    const camera = cameraRef.current;
    if (!node || !camera) return null;
    const [x, y] = camera.toCanvas(node.x, node.y);
    return { x, y: y + node.radius * camera.scale };
  });

  /** 节点圆与悬停标题的并集（画布坐标） */
  const hoverBoxOf = useMemoizedFn((id: number): Box | null => {
    const node = sceneRef.current?.nodeById.get(id);
    const camera = cameraRef.current;
    if (!node || !camera) return null;
    const [x, y] = camera.toCanvas(node.x, node.y);
    const r = node.radius * camera.scale;
    const label = rendererRef.current?.hoverLabelBox();
    return {
      left: Math.min(x - r, label?.left ?? Infinity),
      top: y - r,
      right: Math.max(x + r, label?.right ?? -Infinity),
      bottom: Math.max(y + r, label?.bottom ?? -Infinity),
    };
  });

  // ---- 指针交互
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const localPoint = (event: PointerEvent | WheelEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    /** 悬停节点的标题范围，向上延伸到节点中心，盖住节点与标题之间的缝 */
    const insideHoverLabel = (canvasX: number, canvasY: number) => {
      const box = rendererRef.current?.hoverLabelBox();
      const anchor = hoveredRef.current === null ? null : anchorOf(hoveredRef.current);
      if (!box || !anchor) return false;
      const top = Math.min(box.top, anchor.y);
      return canvasX >= box.left && canvasX <= box.right && canvasY >= top && canvasY <= box.bottom;
    };

    const pickAt = (canvasX: number, canvasY: number) => {
      const camera = cameraRef.current;
      const picker = pickerRef.current;
      if (!camera || !picker) return null;
      const [worldX, worldY] = camera.toWorld(canvasX, canvasY);
      const node = picker.pick(worldX, worldY, camera.scale);
      // 播放中还没出现的卡片不可悬停 / 点击
      if (node && (revealRef.current?.get(node.id) ?? 1) <= 0) return null;
      return node;
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
      // 鼠标从节点挪到它自己的标题上（或两者之间的缝）时保持悬停：
      // 否则悬停一断标题就消失，鼠标又落回节点上，标题再出现，来回闪
      if (!node && hoveredRef.current !== null && insideHoverLabel(x, y)) return;
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
        const box = hoverBoxOf(nextId);
        if (box) onHoverNode?.({ id: nextId, box });
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
        const item = itemsRef.current.find(entry => entry.id === drag.node!.id);
        if (item) onClickNode?.(item);
      } else {
        clearHover();
      }
    };

    const onPointerLeave = (event: PointerEvent) => {
      if (dragRef.current) return;
      // 移进预览面板不算离开：用户要去滚动 / 阅读正文。离开面板时由宿主调 clearHover
      if (keepHoverOnLeave?.(event.relatedTarget)) return;
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
  }, [
    anchorOf,
    clearHover,
    enableHoverPreview,
    hoverBoxOf,
    keepHoverOnLeave,
    onClickNode,
    onHoverNode,
  ]);

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

  const keyToId = useMemo(() => new Map(items.map(item => [item.key, item.id])), [items]);
  const shapesOf = (scene: GraphScene) => {
    const cached = geometryCacheRef.current;
    if (cached?.scene === scene) return cached.shapes;
    const shapes = clusterGeometry(scene);
    geometryCacheRef.current = { scene, shapes };
    return shapes;
  };
  const worldTopic = useMemoizedFn((topicId: number) => {
    const scene = sceneRef.current;
    if (!scene || !isMapScene(scene)) return null;
    const cluster = scene.topicCluster.get(topicId);
    return cluster === undefined ? null : (shapesOf(scene).get(cluster) ?? null);
  });
  const overlay = useMemo<GraphOverlayApi>(
    () => ({
      subscribeFrame: listener => {
        frameListenersRef.current.add(listener);
        dirtyRef.current = true;
        return () => frameListenersRef.current.delete(listener);
      },
      project: key => {
        const id = keyToId.get(key);
        const node = id === undefined ? null : sceneRef.current?.nodeById.get(id);
        const camera = cameraRef.current;
        if (!node || !camera) return null;
        const [x, y] = camera.toCanvas(node.x, node.y);
        return { x, y, r: Math.max(1.2, node.radius * camera.scale) };
      },
      topicShape: topicId => {
        const shape = worldTopic(topicId);
        const camera = cameraRef.current;
        if (!shape || !camera) return null;
        const [x, y] = camera.toCanvas(shape.x, shape.y);
        return { x, y, radius: shape.radius * camera.scale };
      },
      subtopicCenter: subtopicId => {
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        if (!scene || !camera || !isMapScene(scene)) return null;
        const sub = scene.subtopics.find(item => item.id === subtopicId);
        if (!sub?.members.length) return null;
        let sumX = 0;
        let sumY = 0;
        let count = 0;
        for (const id of sub.members) {
          const node = scene.nodeById.get(id);
          if (!node) continue;
          sumX += node.x;
          sumY += node.y;
          count += 1;
        }
        if (!count) return null;
        const [x, y] = camera.toCanvas(sumX / count, sumY / count);
        return { x, y };
      },
      scale: () => cameraRef.current?.scale ?? 1,
      subtopicLabelScale: MAP_SUBTOPIC_LABEL_SCALE,
      nodeLabelScale: MAP_CARD_LABEL_SCALE,
      flyToTopic: topicId => {
        const shape = worldTopic(topicId);
        const camera = cameraRef.current;
        const container = containerRef.current;
        if (!shape || !camera || !container) return;
        const viewport = Math.min(container.clientWidth, container.clientHeight) || 600;
        // 岛的直径占视口短边的七成；最少放大到能看清子主题名
        const scale = Math.max(
          MAP_SUBTOPIC_LABEL_SCALE * 1.05,
          (viewport * 0.7) / Math.max(1, shape.radius * 2)
        );
        camera.flyTo({ x: shape.x, y: shape.y, scale }, 700);
        dirtyRef.current = true;
      },
      flyToAll: () => {
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        const container = containerRef.current;
        if (!scene || !camera || !container) return;
        // 先算出全图视角，再从当前视角飞过去（fit 是瞬移）
        const from = { ...camera.current };
        camera.fit(sceneBounds(scene), fitViewPadding);
        const target = camera.current;
        camera.restore(from);
        camera.flyTo(
          {
            x: container.clientWidth / 2 / target.scale - target.offsetX,
            y: container.clientHeight / 2 / target.scale - target.offsetY,
            scale: target.scale,
          },
          700
        );
        dirtyRef.current = true;
      },
      flyToItems: keys => {
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        const container = containerRef.current;
        if (!scene || !camera || !container) return;
        const nodes = keys.flatMap(key => {
          const id = keyToId.get(key);
          const node = id === undefined ? undefined : scene.nodeById.get(id);
          return node ? [node] : [];
        });
        if (!nodes.length) return;
        const width = container.clientWidth;
        const height = container.clientHeight;
        // 留出标题签与气泡的位置
        const margin = 90;
        const inView = nodes.every(node => {
          const [x, y] = camera.toCanvas(node.x, node.y);
          return x >= margin && x <= width - margin && y >= margin && y <= height - margin;
        });
        if (inView) return;
        const xs = nodes.map(node => node.x);
        const ys = nodes.map(node => node.y);
        const spanX = Math.max(...xs) - Math.min(...xs);
        const spanY = Math.max(...ys) - Math.min(...ys);
        const fitScale = Math.min(
          (width - margin * 2) / Math.max(1, spanX),
          (height - margin * 2) / Math.max(1, spanY)
        );
        camera.flyTo(
          {
            x: (Math.max(...xs) + Math.min(...xs)) / 2,
            y: (Math.max(...ys) + Math.min(...ys)) / 2,
            scale: Math.min(camera.scale, fitScale),
          },
          500
        );
        dirtyRef.current = true;
      },
    }),
    [keyToId, worldTopic, fitViewPadding]
  );

  const playback = useMemo<PlaybackControls>(
    () => ({ state: playbackState, play, stop: stopPlayback }),
    [playbackState, play, stopPlayback]
  );

  return {
    containerRef,
    canvasRef,
    ready,
    focusNode,
    fitView: doFitView,
    anchorOf,
    clearHover,
    playback,
    overlay,
  };
}
