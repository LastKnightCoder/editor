import React, {
  useMemo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  memo,
  forwardRef,
  useImperativeHandle,
} from "react";
import clsx from "classnames";
import { Editor } from "@tau/editor/src";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import { MindUtil } from "@/components/WhiteBoard/utils/MindUtil";
import { MindNodeElement } from "@/components/WhiteBoard/types/mind";
import {
  DEFAULT_THEME_ID,
  MindMapTheme,
  getThemeById,
} from "@/components/WhiteBoard/constants/mind-themes";
import { MindMapNodeData, FlattenedMindMapNode } from "./types";
import { useMindMapMeasurements } from "./useMindMapMeasurements";
import { Descendant } from "slate";

const MAX_NODE_WIDTH = 300;
const CANVAS_PADDING = 80;
const HASH_VERSION = "v1";
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.5;

export interface MindMapRef {
  getLayoutTree: () => MindNodeElement | null;
}

const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

const sanitizeMindDataDirections = (
  node: MindMapNodeData,
  level = 1,
): MindMapNodeData => {
  let nextChildren = node.children;
  if (node.children && node.children.length > 0) {
    const sanitizedChildren = node.children.map((child) =>
      sanitizeMindDataDirections(child, level + 1),
    );
    if (
      sanitizedChildren.some((child, index) => child !== node.children?.[index])
    ) {
      nextChildren = sanitizedChildren;
    }
  }

  if (level === 1 && node.direction) {
    const { direction: _omit, ...rest } = node;
    return {
      ...rest,
      children: nextChildren,
    };
  }

  if (nextChildren !== node.children) {
    return {
      ...node,
      children: nextChildren,
    };
  }

  return node;
};

const resolveChildDirection = (
  parent: MindNodeElement,
  child: MindNodeElement,
): "left" | "right" => {
  if (child.direction) {
    return child.direction;
  }
  return parent.direction;
};

const splitChildrenByDirection = (node: MindNodeElement) => {
  const left: MindNodeElement[] = [];
  const right: MindNodeElement[] = [];
  node.children.forEach((child) => {
    const direction = resolveChildDirection(node, child);
    if (direction === "left") {
      left.push(child);
    } else {
      right.push(child);
    }
  });
  return { left, right };
};

interface MindMapProps {
  data: MindMapNodeData;
  themeId?: string;
  className?: string;
  style?: React.CSSProperties;
  cacheNamespace?: string;
  initialPan?: { x: number; y: number };
  initialZoom?: number;
}

interface NodeVisualStyle {
  background: string;
  textColor: string;
  borderRadius: number;
  borderColor: string;
  borderWidth: number;
  editorTheme: "light" | "dark";
}

interface Connection {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
  direction: "left" | "right";
}

interface FoldIndicator {
  id: string;
  nodeId: string;
  direction: "left" | "right";
  x: number;
  y: number;
  background: string;
  color: string;
  isFolded: boolean;
  count: number;
}

const getNodeStyle = (level: number, theme: MindMapTheme): NodeVisualStyle => {
  if (level === 1) {
    return {
      background: theme.root.background,
      textColor: theme.root.color,
      borderRadius: theme.root.borderRadius,
      borderColor: theme.root.borderColor || "transparent",
      borderWidth: theme.root.borderWidth || 0,
      editorTheme: theme.root.color === "#ffffff" ? "dark" : "light",
    };
  }

  const paletteIndex = (level - 2) % theme.palette.length;
  const paletteItem = theme.palette[paletteIndex];

  return {
    background: paletteItem.background,
    textColor: paletteItem.color,
    borderRadius: theme.node.borderRadius,
    borderColor: theme.node.borderColor,
    borderWidth: theme.node.borderWidth,
    editorTheme: paletteItem.type,
  };
};

const flattenMindNodes = (root: MindMapNodeData): FlattenedMindMapNode[] => {
  const result: FlattenedMindMapNode[] = [];
  const walk = (node: MindMapNodeData, level: number, parentId?: string) => {
    result.push({ node, level, parentId });
    node.children?.forEach((child) => walk(child, level + 1, node.id));
  };

  walk(root, 1);
  return result;
};

const buildMindNodeTree = (
  root: MindMapNodeData,
  sizes: Record<string, { width: number; height: number }>,
): MindNodeElement => {
  const walk = (
    node: MindMapNodeData,
    level: number,
    inheritDirection: "left" | "right",
  ): MindNodeElement => {
    const size = sizes[node.id];
    if (!size) {
      throw new Error(`Missing size for node ${node.id}`);
    }

    const direction =
      level === 1 ? "right" : node.direction || inheritDirection || "right";
    const children = (node.children || []).map((child) =>
      walk(child, level + 1, child.direction || direction),
    );

    return {
      id: node.id,
      type: "mind-node",
      x: level === 1 ? 0 : 0,
      y: 0,
      width: size.width,
      height: size.height,
      actualHeight: size.height,
      level,
      children,
      childrenHeight: 0,
      leftChildrenHeight: 0,
      rightChildrenHeight: 0,
      direction,
      text: node.text || [],
      background: undefined,
      defaultFocus: false,
      isLeftFold: node.isLeftFold ?? false,
      isRightFold: node.isRightFold ?? false,
    };
  };

  return walk(root, 1, "right");
};

const getBezierPath = (connection: Connection) => {
  const { from, to, direction } = connection;
  const deltaX = Math.abs(to.x - from.x);
  const controlX =
    direction === "left" ? from.x - deltaX / 2 : from.x + deltaX / 2;
  return `M ${from.x} ${from.y} C ${controlX} ${from.y}, ${controlX} ${to.y}, ${to.x} ${to.y}`;
};

const MindMapMeasureNode = ({
  flattened,
  hash,
  theme,
  onMeasured,
}: {
  flattened: FlattenedMindMapNode;
  hash: string;
  theme: MindMapTheme;
  onMeasured: (
    id: string,
    size: { width: number; height: number },
    hash: string,
  ) => void;
}) => {
  const dynamicExtensions = useDynamicExtensionsStore(
    (state) => state.extensions,
  );
  const wrapperRef = useRef<HTMLDivElement>(null);
  const visualStyle = useMemo(
    () => getNodeStyle(flattened.level, theme),
    [flattened.level, theme],
  );

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;

    const measure = (entry?: ResizeObserverEntry) => {
      if (!element) return;
      const width =
        entry?.borderBoxSize?.[0]?.inlineSize || element.offsetWidth;
      const height =
        entry?.borderBoxSize?.[0]?.blockSize || element.offsetHeight;

      if (!width || !height) return;
      // 加上 1px 边距避免亚像素渲染导致的文本换行问题
      const finalWidth = Math.max(
        40,
        Math.min(MAX_NODE_WIDTH, Math.ceil(width) + 1),
      );
      const finalHeight = Math.max(40, Math.ceil(height));
      onMeasured(
        flattened.node.id,
        {
          width: finalWidth,
          height: finalHeight,
        },
        hash,
      );
    };

    const resizeObserver = new ResizeObserver((entries) => {
      measure(entries[0]);
    });
    resizeObserver.observe(element);

    const raf = requestAnimationFrame(() => measure());

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [flattened.node.id, hash, onMeasured]);

  return (
    <div
      className="inline-block px-4 py-3 max-w-75 box-border"
      ref={wrapperRef}
      style={{
        background: visualStyle.background,
        borderRadius: visualStyle.borderRadius,
        border: `${visualStyle.borderWidth}px solid ${visualStyle.borderColor}`,
        color: visualStyle.textColor,
        maxWidth: MAX_NODE_WIDTH,
      }}
    >
      <div className="pointer-events-none **:data-slate-editor:text-sm **:data-slate-editor:leading-[1.6] **:data-slate-editor:outline-none [&_.slate-Editor]:bg-transparent">
        <Editor
          initValue={flattened.node.text}
          readonly
          extensions={dynamicExtensions}
          theme={visualStyle.editorTheme}
        />
      </div>
    </div>
  );
};

interface MindMapNodeContentProps {
  value: Descendant[];
  editorTheme: "light" | "dark";
}

const MindMapNodeContent = memo(
  ({ value, editorTheme }: MindMapNodeContentProps) => {
    const dynamicExtensions = useDynamicExtensionsStore(
      (state) => state.extensions,
    );
    return (
      <Editor
        initValue={value}
        readonly
        extensions={dynamicExtensions}
        theme={editorTheme}
      />
    );
  },
  (prev, next) =>
    prev.editorTheme === next.editorTheme && prev.value === next.value,
);

const MindMap = forwardRef<MindMapRef, MindMapProps>(
  (
    {
      data,
      themeId = DEFAULT_THEME_ID,
      className,
      style,
      cacheNamespace,
      initialPan,
      initialZoom,
    },
    ref,
  ) => {
    const theme = useMemo(() => getThemeById(themeId), [themeId]);
    useEffect(() => {
      setPan(initialPan ?? { x: 0, y: 0 });
      setZoom(initialZoom ?? 1);
      setShouldAutoCenter(!initialPan);
      lastBoundsOffsetRef.current = null;
    }, [data, initialPan, initialZoom]);

    const sanitizedData = useMemo(
      () => sanitizeMindDataDirections(data),
      [data],
    );
    const [pan, setPan] = useState(initialPan ?? { x: 0, y: 0 });
    const [zoom, setZoom] = useState(initialZoom ?? 1);
    const [shouldAutoCenter, setShouldAutoCenter] = useState(!initialPan);
    const [isDragging, setIsDragging] = useState(false);
    const lastBoundsOffsetRef = useRef<{ x: number; y: number } | null>(null);

    const panRef = useRef(pan);
    useEffect(() => {
      panRef.current = pan;
    }, [pan]);

    const containerRef = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    useEffect(() => {
      const element = containerRef.current;
      if (!element) return;
      const resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        const box = entry.borderBoxSize?.[0];
        const width =
          box?.inlineSize ?? entry.contentRect.width ?? element.clientWidth;
        const height =
          box?.blockSize ?? entry.contentRect.height ?? element.clientHeight;
        setContainerSize({ width, height });
      });
      resizeObserver.observe(element);
      return () => resizeObserver.disconnect();
    }, []);

    const flattenedNodes = useMemo(
      () => flattenMindNodes(sanitizedData),
      [sanitizedData],
    );

    const toggleFoldState = useCallback(
      (nodeId: string, direction: "left" | "right") => {
        setShouldAutoCenter(false);
        setLayoutTree((prev) => {
          if (!prev) return prev;
          const target = MindUtil.findNodeInTree(prev, nodeId);
          if (!target) return prev;
          const next = MindUtil.toggleFold(prev, target, direction);
          return next;
        });
      },
      [],
    );

    const hashKey = useMemo(
      () =>
        JSON.stringify({
          theme: theme.id,
          maxWidth: MAX_NODE_WIDTH,
          version: HASH_VERSION,
        }),
      [theme.id],
    );

    const { nodeSizes, nodesToMeasure, reportSize } = useMindMapMeasurements(
      flattenedNodes,
      {
        hashKey,
        cacheNamespace,
      },
    );

    const canLayout =
      flattenedNodes.length > 0 &&
      flattenedNodes.every((item) => Boolean(nodeSizes[item.node.id]));

    const [layoutTree, setLayoutTree] = useState<MindNodeElement | null>(null);
    useEffect(() => {
      if (!canLayout) {
        setLayoutTree(null);
        return;
      }
      const root = buildMindNodeTree(sanitizedData, nodeSizes);
      setLayoutTree(MindUtil.layout(root));
    }, [canLayout, sanitizedData, nodeSizes]);

    const { visibleNodes, connections, foldIndicators } = useMemo(() => {
      if (!layoutTree) {
        return {
          visibleNodes: [] as MindNodeElement[],
          connections: [] as Connection[],
          foldIndicators: [] as FoldIndicator[],
        };
      }

      const nodes: MindNodeElement[] = [];
      const edges: Connection[] = [];
      const indicators: FoldIndicator[] = [];

      const walk = (node: MindNodeElement, hidden: boolean) => {
        if (hidden) {
          return;
        }

        const nodeStyle = getNodeStyle(node.level, theme);
        nodes.push(node);
        const { left: leftChildren, right: rightChildren } =
          splitChildrenByDirection(node);

        if (leftChildren.length > 0) {
          indicators.push({
            id: `${node.id}-left`,
            nodeId: node.id,
            direction: "left",
            x: node.x - 10,
            y: node.y + node.height / 2,
            background: nodeStyle.background,
            color: nodeStyle.textColor,
            isFolded: Boolean(node.isLeftFold),
            count: leftChildren.reduce(
              (total, child) =>
                total + MindUtil.getChildrenByNode(child).length + 1,
              0,
            ),
          });
        }

        if (rightChildren.length > 0) {
          indicators.push({
            id: `${node.id}-right`,
            nodeId: node.id,
            direction: "right",
            x: node.x + node.width + 10,
            y: node.y + node.height / 2,
            background: nodeStyle.background,
            color: nodeStyle.textColor,
            isFolded: Boolean(node.isRightFold),
            count: rightChildren.reduce(
              (total, child) =>
                total + MindUtil.getChildrenByNode(child).length + 1,
              0,
            ),
          });
        }

        node.children.forEach((child) => {
          const branchDirection = resolveChildDirection(node, child);
          const isLeftBranch = branchDirection === "left";
          const childHidden =
            hidden ||
            (isLeftBranch
              ? Boolean(node.isLeftFold)
              : Boolean(node.isRightFold));

          if (!childHidden) {
            edges.push({
              id: `${node.id}-${child.id}`,
              from: {
                x: isLeftBranch ? node.x : node.x + node.width,
                y: node.y + node.height / 2,
              },
              to: {
                x: isLeftBranch ? child.x + child.width : child.x,
                y: child.y + child.height / 2,
              },
              color:
                child.level === 1
                  ? theme.root.background
                  : theme.palette[(child.level - 2) % theme.palette.length]
                      .background,
              direction: branchDirection,
            });
          }
          walk(child, childHidden);
        });
      };

      walk(layoutTree, false);

      return {
        visibleNodes: nodes,
        connections: edges,
        foldIndicators: indicators,
      };
    }, [layoutTree, theme]);

    const bounds = useMemo(() => {
      if (visibleNodes.length === 0) {
        return {
          width: 0,
          height: 0,
          offsetX: CANVAS_PADDING,
          offsetY: CANVAS_PADDING,
        };
      }
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      visibleNodes.forEach((node) => {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + node.width);
        maxY = Math.max(maxY, node.y + node.height);
      });

      const width = maxX - minX + CANVAS_PADDING * 2;
      const height = maxY - minY + CANVAS_PADDING * 2;

      return {
        width,
        height,
        offsetX: CANVAS_PADDING - minX,
        offsetY: CANVAS_PADDING - minY,
      };
    }, [visibleNodes]);

    useLayoutEffect(() => {
      if (!layoutTree) return;
      if (!bounds.width || !bounds.height) return;

      if (shouldAutoCenter) {
        if (!containerSize.width || !containerSize.height) return;
        setPan({
          x: (containerSize.width - bounds.width * zoom) / 2,
          y: (containerSize.height - bounds.height * zoom) / 2,
        });
        setShouldAutoCenter(false);
        lastBoundsOffsetRef.current = {
          x: bounds.offsetX,
          y: bounds.offsetY,
        };
        return;
      }

      const prevOffsets = lastBoundsOffsetRef.current;
      if (prevOffsets) {
        const deltaX = prevOffsets.x - bounds.offsetX;
        const deltaY = prevOffsets.y - bounds.offsetY;
        if (Math.abs(deltaX) > 0.1 || Math.abs(deltaY) > 0.1) {
          setPan((prevPan) => ({
            x: prevPan.x + deltaX * zoom,
            y: prevPan.y + deltaY * zoom,
          }));
        }
      }
      lastBoundsOffsetRef.current = {
        x: bounds.offsetX,
        y: bounds.offsetY,
      };
    }, [
      layoutTree,
      containerSize.width,
      containerSize.height,
      bounds.width,
      bounds.height,
      bounds.offsetX,
      bounds.offsetY,
      shouldAutoCenter,
      zoom,
    ]);

    const handlePointerDown = useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        const target = event.target as HTMLElement;
        if (target.closest("[data-fold-indicator]")) {
          return;
        }
        event.preventDefault();
        setShouldAutoCenter(false);
        const startPointer = { x: event.clientX, y: event.clientY };
        const startPan = panRef.current;
        setIsDragging(true);

        const handleMove = (moveEvent: PointerEvent) => {
          setPan({
            x: startPan.x + (moveEvent.clientX - startPointer.x),
            y: startPan.y + (moveEvent.clientY - startPointer.y),
          });
        };

        const stopDragging = () => {
          setIsDragging(false);
          window.removeEventListener("pointermove", handleMove);
          window.removeEventListener("pointerup", stopDragging);
          window.removeEventListener("pointercancel", stopDragging);
        };

        window.addEventListener("pointermove", handleMove);
        window.addEventListener("pointerup", stopDragging);
        window.addEventListener("pointercancel", stopDragging);
      },
      [],
    );

    const handleWheel = useCallback(
      (event: WheelEvent) => {
        if (!layoutTree) return;
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          setShouldAutoCenter(false);
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          const cursorX = event.clientX - rect.left;
          const cursorY = event.clientY - rect.top;
          const zoomFactor = Math.exp(-event.deltaY / 500);
          const nextZoom = clamp(zoom * zoomFactor, MIN_ZOOM, MAX_ZOOM);
          const scale = nextZoom / zoom;
          setPan((prev) => ({
            x: cursorX - (cursorX - prev.x) * scale,
            y: cursorY - (cursorY - prev.y) * scale,
          }));
          setZoom(nextZoom);
        } else {
          event.preventDefault();
          setShouldAutoCenter(false);
          setPan((prev) => ({
            x: prev.x - event.deltaX,
            y: prev.y - event.deltaY,
          }));
        }
      },
      [layoutTree, zoom],
    );

    useEffect(() => {
      const element = containerRef.current;
      if (!element) return;
      const listener = (event: WheelEvent) => handleWheel(event);
      element.addEventListener("wheel", listener, { passive: false });
      return () => {
        element.removeEventListener("wheel", listener);
      };
    }, [handleWheel]);

    useImperativeHandle(ref, () => ({
      getLayoutTree: () => layoutTree,
    }));

    return (
      <div
        ref={containerRef}
        className={clsx(
          "relative w-full h-full overflow-hidden touch-none bg-[#fafafa] dark:bg-[#1a1a1a]",
          className,
        )}
        style={style}
        onPointerDown={handlePointerDown}
      >
        {layoutTree ? (
          <div className="relative w-full h-full overflow-hidden">
            <div
              className="absolute top-0 left-0 w-full h-full origin-top-left"
              style={{
                width: bounds.width,
                height: bounds.height,
                transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                cursor: isDragging ? "grabbing" : "grab",
              }}
            >
              <svg
                className="absolute top-0 left-0 w-full h-full pointer-events-none"
                width={bounds.width}
                height={bounds.height}
              >
                {connections.map((connection) => (
                  <path
                    key={connection.id}
                    d={getBezierPath({
                      ...connection,
                      from: {
                        x: connection.from.x + bounds.offsetX,
                        y: connection.from.y + bounds.offsetY,
                      },
                      to: {
                        x: connection.to.x + bounds.offsetX,
                        y: connection.to.y + bounds.offsetY,
                      },
                    })}
                    stroke={connection.color}
                    strokeWidth={2}
                    fill="none"
                  />
                ))}
              </svg>
              {visibleNodes.map((node) => {
                const visualStyle = getNodeStyle(node.level, theme);
                return (
                  <div
                    key={node.id}
                    className="absolute box-border px-4 py-3 max-w-75 bg-white dark:bg-[#2a2a2a] shadow-[0_6px_20px_rgba(15,23,42,0.12)] dark:shadow-[0_6px_20px_rgba(0,0,0,0.3)]"
                    style={{
                      left: node.x + bounds.offsetX,
                      top: node.y + bounds.offsetY,
                      width: node.width,
                      background: visualStyle.background,
                      color: visualStyle.textColor,
                      borderRadius: visualStyle.borderRadius,
                      border: `${visualStyle.borderWidth}px solid ${visualStyle.borderColor}`,
                    }}
                  >
                    <div className="pointer-events-none **:data-slate-editor:text-sm **:data-slate-editor:leading-[1.6] **:data-slate-editor:outline-none [&_.slate-Editor]:bg-transparent">
                      <MindMapNodeContent
                        value={node.text}
                        editorTheme={visualStyle.editorTheme}
                      />
                    </div>
                  </div>
                );
              })}
              {foldIndicators.map((indicator) => (
                <div
                  key={indicator.id}
                  role="button"
                  data-fold-indicator
                  className="absolute w-5 h-5 rounded-full text-[11px] font-semibold flex items-center justify-center -translate-x-1/2 -translate-y-1/2 shadow-[0_2px_6px_rgba(0,0,0,0.15)] cursor-pointer select-none"
                  style={{
                    left: indicator.x + bounds.offsetX,
                    top: indicator.y + bounds.offsetY,
                    background: indicator.background,
                    color: indicator.color,
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFoldState(indicator.nodeId, indicator.direction);
                  }}
                >
                  {indicator.isFolded ? indicator.count : "-"}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center min-h-[160px] text-black/45 dark:text-white/45 text-sm">
            正在测量节点尺寸...
          </div>
        )}

        <div
          className="absolute -top-[9999px] -left-[9999px] invisible pointer-events-none -z-10"
          aria-hidden
        >
          {nodesToMeasure.map((item) => (
            <MindMapMeasureNode
              key={`${item.node.node.id}-${item.hash}`}
              flattened={item.node}
              hash={item.hash}
              theme={theme}
              onMeasured={reportSize}
            />
          ))}
        </div>
      </div>
    );
  },
);

MindMap.displayName = "MindMap";

export default MindMap;
