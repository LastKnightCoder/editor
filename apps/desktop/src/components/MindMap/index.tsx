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
  ReactNode,
} from "react";
import { getContentKit } from "@/services/editorKit";
import clsx from "classnames";
import { Editor, EditorThemeOverride } from "@tau/editor/src";
import { MindUtil } from "@/components/WhiteBoard/utils/MindUtil";
import { MindNodeElement } from "@/components/WhiteBoard/types/mind";
import MindThemeUtil, {
  type MindMode,
  type MindNodeVisual,
} from "@/components/WhiteBoard/utils/MindThemeUtil";
import { useMindMode } from "@/components/WhiteBoard/hooks/useMindTheme";
import { MindMapNodeData, FlattenedMindMapNode } from "./types";
import { useMindMapMeasurements } from "./useMindMapMeasurements";
import { Descendant } from "slate";

const MAX_NODE_WIDTH = 560;
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

const parseToRgb = (color: string): [number, number, number] | null => {
  const hexMatch = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    let h = hexMatch[1];
    if (h.length === 3) {
      h = h
        .split("")
        .map(c => c + c)
        .join("");
    }
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgbMatch = color.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (rgbMatch) {
    return [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
  }
  return null;
};

const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h = h < 0 ? h + 6 : h;
  return [h * 60, s, l];
};

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0,
    g1 = 0,
    b1 = 0;
  if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = l - c / 2;
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
};

const getSelectedRingColor = (bg: string, isDark: boolean): string => {
  const rgb = parseToRgb(bg);
  if (!rgb) {
    return isDark ? "rgba(255,255,255,0.75)" : "rgba(30,41,59,0.75)";
  }
  const [r, g, b] = rgb;
  const [h, s, l] = rgbToHsl(r, g, b);
  const targetL = l > 0.55 ? Math.max(0.3, l * 0.5) : Math.min(0.8, l + 0.35);
  const [nr, ng, nb] = hslToRgb(h, s, targetL);
  return `rgb(${nr}, ${ng}, ${nb})`;
};

const getSelectedBoxShadow = (bg: string, isDark: boolean): string => {
  return `0 0 0 2px ${getSelectedRingColor(bg, isDark)}`;
};

const sanitizeMindDataDirections = (node: MindMapNodeData, level = 1): MindMapNodeData => {
  let nextChildren = node.children;
  if (node.children && node.children.length > 0) {
    const sanitizedChildren = node.children.map(child =>
      sanitizeMindDataDirections(child, level + 1)
    );
    if (sanitizedChildren.some((child, index) => child !== node.children?.[index])) {
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
  child: MindNodeElement
): "left" | "right" => {
  if (child.direction) {
    return child.direction;
  }
  return parent.direction;
};

const splitChildrenByDirection = (node: MindNodeElement) => {
  const left: MindNodeElement[] = [];
  const right: MindNodeElement[] = [];
  node.children.forEach(child => {
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
  /** solid / soft / outline，默认 solid */
  themeStyle?: string;
  className?: string;
  style?: React.CSSProperties;
  cacheNamespace?: string;
  initialPan?: { x: number; y: number };
  initialZoom?: number;
  selectedNodeIds?: string[];
  interactionMode?: "readonly" | "editable";
  onNodeClick?: (nodeId: string) => void;
  renderNodeActions?: (node: MindMapNodeData, context: MindMapNodeActionContext) => ReactNode;
  renderNodeContent?: (node: MindMapNodeData) => ReactNode;
  onViewportChange?: (viewport: { pan: { x: number; y: number }; zoom: number }) => void;
  onNodeFoldChange?: (nodeId: string, direction: "left" | "right", folded: boolean) => void;
}

export interface MindMapNodeActionContext {
  actionSide: "left" | "right";
  hasFoldIndicator: boolean;
}

interface Connection {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
  width: number;
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

type NodeStyleResolver = (level: number, nodeId: string) => MindNodeVisual;

const createNodeStyleResolver = (
  theme: { themeId: string; themeStyle: string },
  root: MindMapNodeData,
  mode: MindMode
): NodeStyleResolver => {
  const branchMap = MindThemeUtil.getBranchIndexMap(root);
  return (level, nodeId) =>
    MindThemeUtil.getNodeVisual(theme, level, branchMap.get(nodeId) ?? 0, mode);
};

const flattenMindNodes = (root: MindMapNodeData): FlattenedMindMapNode[] => {
  const result: FlattenedMindMapNode[] = [];
  const walk = (node: MindMapNodeData, level: number, parentId?: string) => {
    result.push({ node, level, parentId });
    node.children?.forEach(child => walk(child, level + 1, node.id));
  };

  walk(root, 1);
  return result;
};

const buildNodeMap = (root: MindMapNodeData) => {
  const map = new Map<string, MindMapNodeData>();
  const walk = (node: MindMapNodeData) => {
    map.set(node.id, node);
    node.children?.forEach(walk);
  };
  walk(root);
  return map;
};

const buildMindNodeTree = (
  root: MindMapNodeData,
  sizes: Record<string, { width: number; height: number }>
): MindNodeElement => {
  const walk = (
    node: MindMapNodeData,
    level: number,
    inheritDirection: "left" | "right"
  ): MindNodeElement => {
    const size = sizes[node.id];
    if (!size) {
      throw new Error(`Missing size for node ${node.id}`);
    }

    const direction = level === 1 ? "right" : node.direction || inheritDirection || "right";
    const children = (node.children || []).map(child =>
      walk(child, level + 1, child.direction || direction)
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
  const controlX = direction === "left" ? from.x - deltaX / 2 : from.x + deltaX / 2;
  return `M ${from.x} ${from.y} C ${controlX} ${from.y}, ${controlX} ${to.y}, ${to.x} ${to.y}`;
};

const MindMapMeasureNode = ({
  flattened,
  hash,
  styleOf,
  onMeasured,
}: {
  flattened: FlattenedMindMapNode;
  hash: string;
  styleOf: NodeStyleResolver;
  onMeasured: (id: string, size: { width: number; height: number }, hash: string) => void;
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const visualStyle = useMemo(
    () => styleOf(flattened.level, flattened.node.id),
    [flattened.level, flattened.node.id, styleOf]
  );
  const measureSingleLine = flattened.node.meta?.measureSingleLine === true;
  const measureInlinePrefixWidth =
    typeof flattened.node.meta?.measureInlinePrefixWidth === "number"
      ? flattened.node.meta.measureInlinePrefixWidth
      : 0;

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;

    const measure = (entry?: ResizeObserverEntry) => {
      if (!element) return;
      const width = entry?.borderBoxSize?.[0]?.inlineSize || element.offsetWidth;
      const height = entry?.borderBoxSize?.[0]?.blockSize || element.offsetHeight;

      if (!width || !height) return;
      // 加上 1px 边距避免亚像素渲染导致的文本换行问题
      const measuredWidth = Math.ceil(width) + 1 + measureInlinePrefixWidth;
      const finalWidth = measureSingleLine
        ? Math.max(40, measuredWidth)
        : Math.max(40, Math.min(MAX_NODE_WIDTH, measuredWidth));
      const finalHeight = Math.max(40, Math.ceil(height));
      onMeasured(
        flattened.node.id,
        {
          width: finalWidth,
          height: finalHeight,
        },
        hash
      );
    };

    const resizeObserver = new ResizeObserver(entries => {
      measure(entries[0]);
    });
    resizeObserver.observe(element);

    const raf = requestAnimationFrame(() => measure());

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [flattened.node.id, hash, measureSingleLine, measureInlinePrefixWidth, onMeasured]);

  return (
    <div
      className="box-border inline-block px-4 py-3"
      ref={wrapperRef}
      style={{
        background: visualStyle.background,
        borderRadius: visualStyle.borderRadius,
        border: `${visualStyle.borderWidth}px solid ${visualStyle.borderColor}`,
        color: visualStyle.textColor,
        maxWidth: measureSingleLine ? undefined : MAX_NODE_WIDTH,
        whiteSpace: measureSingleLine ? "nowrap" : undefined,
      }}
    >
      <div className="**:data-slate-editor:text-sm **:data-slate-editor:leading-[1.6] **:data-slate-editor:outline-none pointer-events-none [&_.slate-Editor]:bg-transparent">
        <EditorThemeOverride mode={visualStyle.editorTheme}>
          <Editor kit={getContentKit()} initValue={flattened.node.text} readonly />
        </EditorThemeOverride>
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
    return (
      <EditorThemeOverride mode={editorTheme}>
        <Editor kit={getContentKit()} initValue={value} readonly />
      </EditorThemeOverride>
    );
  },
  (prev, next) => prev.editorTheme === next.editorTheme && prev.value === next.value
);

const MindMap = forwardRef<MindMapRef, MindMapProps>(
  (
    {
      data,
      themeId,
      themeStyle,
      className,
      style,
      cacheNamespace,
      initialPan,
      initialZoom,
      selectedNodeIds,
      interactionMode = "readonly",
      onNodeClick,
      renderNodeActions,
      renderNodeContent,
      onViewportChange,
      onNodeFoldChange,
    },
    ref
  ) => {
    const mode = useMindMode();
    const isDark = mode === "dark";
    const theme = useMemo(
      () => ({
        themeId: themeId ?? "classic",
        themeStyle: MindThemeUtil.resolveStyle(themeStyle),
      }),
      [themeId, themeStyle]
    );
    const sanitizedData = useMemo(() => sanitizeMindDataDirections(data), [data]);
    const styleOf = useMemo(
      () => createNodeStyleResolver(theme, sanitizedData, mode),
      [theme, sanitizedData, mode]
    );
    const [pan, setPan] = useState(initialPan ?? { x: 0, y: 0 });
    const [zoom, setZoom] = useState(initialZoom ?? 1);
    const [shouldAutoCenter, setShouldAutoCenter] = useState(!initialPan);
    const [isDragging, setIsDragging] = useState(false);
    const lastBoundsOffsetRef = useRef<{ x: number; y: number } | null>(null);
    const initialViewportRef = useRef({ initialPan, initialZoom });

    useEffect(() => {
      initialViewportRef.current = { initialPan, initialZoom };
    }, [initialPan, initialZoom]);

    useEffect(() => {
      const { initialPan: nextInitialPan, initialZoom: nextInitialZoom } =
        initialViewportRef.current;
      setPan(nextInitialPan ?? { x: 0, y: 0 });
      setZoom(nextInitialZoom ?? 1);
      setShouldAutoCenter(!nextInitialPan);
      lastBoundsOffsetRef.current = null;
    }, [data.id]);

    const panRef = useRef(pan);
    useEffect(() => {
      panRef.current = pan;
    }, [pan]);

    const containerRef = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    useEffect(() => {
      const element = containerRef.current;
      if (!element) return;
      const resizeObserver = new ResizeObserver(entries => {
        const entry = entries[0];
        const box = entry.borderBoxSize?.[0];
        const width = box?.inlineSize ?? entry.contentRect.width ?? element.clientWidth;
        const height = box?.blockSize ?? entry.contentRect.height ?? element.clientHeight;
        setContainerSize({ width, height });
      });
      resizeObserver.observe(element);
      return () => resizeObserver.disconnect();
    }, []);

    const flattenedNodes = useMemo(() => flattenMindNodes(sanitizedData), [sanitizedData]);
    const nodeDataMap = useMemo(() => buildNodeMap(sanitizedData), [sanitizedData]);
    const selectedNodeIdSet = useMemo(() => {
      return new Set(selectedNodeIds || []);
    }, [selectedNodeIds]);

    useEffect(() => {
      onViewportChange?.({ pan, zoom });
    }, [onViewportChange, pan, zoom]);

    const toggleFoldState = useCallback(
      (nodeId: string, direction: "left" | "right") => {
        setShouldAutoCenter(false);
        setLayoutTree(prev => {
          if (!prev) return prev;
          const target = MindUtil.findNodeInTree(prev, nodeId);
          if (!target) return prev;
          const folded = direction === "left" ? !target.isLeftFold : !target.isRightFold;
          const next = MindUtil.toggleFold(prev, target, direction);
          onNodeFoldChange?.(nodeId, direction, folded);
          return next;
        });
      },
      [onNodeFoldChange]
    );

    const hashKey = useMemo(
      () =>
        JSON.stringify({
          theme: `${theme.themeId}-${theme.themeStyle}`,
          maxWidth: MAX_NODE_WIDTH,
          version: HASH_VERSION,
        }),
      [theme.themeId, theme.themeStyle]
    );

    const { nodeSizes, nodesToMeasure, reportSize } = useMindMapMeasurements(flattenedNodes, {
      hashKey,
      cacheNamespace,
    });

    const canLayout =
      flattenedNodes.length > 0 && flattenedNodes.every(item => Boolean(nodeSizes[item.node.id]));

    const [layoutTree, setLayoutTree] = useState<MindNodeElement | null>(null);
    useEffect(() => {
      if (!canLayout) {
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

        const nodeStyle = styleOf(node.level, node.id);
        nodes.push(node);
        const { left: leftChildren, right: rightChildren } = splitChildrenByDirection(node);

        if (leftChildren.length > 0) {
          indicators.push({
            id: `${node.id}-left`,
            nodeId: node.id,
            direction: "left",
            x: node.x - 10,
            y: node.y + node.height / 2,
            background: nodeStyle.accent,
            color: nodeStyle.accentText,
            isFolded: Boolean(node.isLeftFold),
            count: leftChildren.reduce(
              (total, child) => total + MindUtil.getChildrenByNode(child).length + 1,
              0
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
            background: nodeStyle.accent,
            color: nodeStyle.accentText,
            isFolded: Boolean(node.isRightFold),
            count: rightChildren.reduce(
              (total, child) => total + MindUtil.getChildrenByNode(child).length + 1,
              0
            ),
          });
        }

        node.children.forEach(child => {
          const branchDirection = resolveChildDirection(node, child);
          const isLeftBranch = branchDirection === "left";
          const childHidden =
            hidden || (isLeftBranch ? Boolean(node.isLeftFold) : Boolean(node.isRightFold));

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
              color: styleOf(child.level, child.id).lineColor,
              width: styleOf(child.level, child.id).lineWidth,
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
    }, [layoutTree, styleOf]);

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

      visibleNodes.forEach(node => {
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
          setPan(prevPan => ({
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

    const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 && event.button !== 2) return;
      const target = event.target as HTMLElement;
      if (target.closest("[data-fold-indicator],[data-mindmap-node],[data-mindmap-interactive]")) {
        return;
      }
      window.dispatchEvent(new CustomEvent("mindmap:canvas-pointer-down"));
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setShouldAutoCenter(false);
      const startPointer = { x: event.clientX, y: event.clientY };
      const startPan = panRef.current;
      let hasMoved = false;
      setIsDragging(true);

      const handleMove = (moveEvent: PointerEvent) => {
        hasMoved = true;
        moveEvent.preventDefault();
        setPan({
          x: startPan.x + (moveEvent.clientX - startPointer.x),
          y: startPan.y + (moveEvent.clientY - startPointer.y),
        });
      };

      const stopDragging = (upEvent?: PointerEvent) => {
        if (hasMoved) {
          upEvent?.preventDefault();
        }
        setIsDragging(false);
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", stopDragging);
        window.removeEventListener("pointercancel", stopDragging);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", stopDragging);
      window.addEventListener("pointercancel", stopDragging);
    }, []);

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
          setPan(prev => ({
            x: cursorX - (cursorX - prev.x) * scale,
            y: cursorY - (cursorY - prev.y) * scale,
          }));
          setZoom(nextZoom);
        } else {
          event.preventDefault();
          setShouldAutoCenter(false);
          setPan(prev => ({
            x: prev.x - event.deltaX,
            y: prev.y - event.deltaY,
          }));
        }
      },
      [layoutTree, zoom]
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
          "relative h-full w-full touch-none overflow-hidden outline-none",
          className
        )}
        style={style}
        onPointerDown={handlePointerDown}
        onContextMenu={event => {
          const target = event.target as HTMLElement;
          if (target.closest("[data-mindmap-node],[data-mindmap-interactive]")) {
            return;
          }
          event.preventDefault();
        }}
      >
        {layoutTree ? (
          <div className="relative h-full w-full overflow-hidden">
            <div
              className="absolute left-0 top-0 h-full w-full origin-top-left"
              style={{
                width: bounds.width,
                height: bounds.height,
                transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                cursor: isDragging ? "grabbing" : "default",
              }}
            >
              <svg
                className="pointer-events-none absolute left-0 top-0 h-full w-full"
                width={bounds.width}
                height={bounds.height}
              >
                {connections.map(connection => (
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
                    strokeWidth={connection.width}
                    fill="none"
                  />
                ))}
              </svg>
              {visibleNodes.map(node => {
                const visualStyle = styleOf(node.level, node.id);
                const nodeData = nodeDataMap.get(node.id);
                const { left: nodeLeftChildren, right: nodeRightChildren } =
                  splitChildrenByDirection(node);
                const actionSide = node.direction === "left" && node.level > 1 ? "left" : "right";
                const hasFoldIndicator =
                  actionSide === "left"
                    ? nodeLeftChildren.length > 0
                    : nodeRightChildren.length > 0;
                const customContent =
                  nodeData && renderNodeContent ? renderNodeContent(nodeData) : null;
                return (
                  <div
                    key={node.id}
                    data-mindmap-node
                    className={clsx(
                      "group/mindmap-node absolute box-border px-4 py-3 outline-none",
                      visualStyle.background !== "transparent" &&
                        "shadow-[0_2px_8px_rgba(15,23,42,0.08)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3)]",
                      interactionMode === "editable" &&
                        "cursor-pointer transition-shadow duration-200 hover:shadow-[0_8px_24px_rgba(15,23,42,0.18)]"
                    )}
                    style={{
                      left: node.x + bounds.offsetX,
                      top: node.y + bounds.offsetY,
                      width: node.width,
                      background: visualStyle.background,
                      color: visualStyle.textColor,
                      borderRadius: visualStyle.borderRadius,
                      border: `${visualStyle.borderWidth}px solid ${visualStyle.borderColor}`,
                      boxShadow: selectedNodeIdSet.has(node.id)
                        ? getSelectedBoxShadow(visualStyle.accent, isDark)
                        : undefined,
                    }}
                    onPointerDown={e => e.stopPropagation()}
                    onClick={e => {
                      if ((e.target as HTMLElement).closest("[data-mindmap-interactive]")) {
                        return;
                      }
                      onNodeClick?.(node.id);
                    }}
                  >
                    {customContent ? (
                      customContent
                    ) : (
                      <div className="**:data-slate-editor:text-sm **:data-slate-editor:leading-[1.6] **:data-slate-editor:outline-none pointer-events-none [&_.slate-Editor]:bg-transparent">
                        <MindMapNodeContent
                          value={node.text}
                          editorTheme={visualStyle.editorTheme}
                        />
                      </div>
                    )}
                    {nodeData &&
                      renderNodeActions &&
                      renderNodeActions(nodeData, {
                        actionSide,
                        hasFoldIndicator,
                      })}
                  </div>
                );
              })}
              {foldIndicators.map(indicator => (
                <div
                  key={indicator.id}
                  role="button"
                  data-fold-indicator
                  className="absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-pointer select-none items-center justify-center rounded-full text-[11px] font-semibold shadow-[0_2px_6px_rgba(0,0,0,0.15)]"
                  style={{
                    left: indicator.x + bounds.offsetX,
                    top: indicator.y + bounds.offsetY,
                    background: indicator.background,
                    color: indicator.color,
                  }}
                  onPointerDown={e => e.stopPropagation()}
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => {
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
          <div className="flex min-h-[160px] items-center justify-center text-sm text-black/45 dark:text-white/45">
            正在测量节点尺寸...
          </div>
        )}

        <div
          className="pointer-events-none invisible absolute -left-[9999px] -top-[9999px] -z-10"
          aria-hidden
        >
          {nodesToMeasure.map(item => (
            <MindMapMeasureNode
              key={`${item.node.node.id}-${item.hash}`}
              flattened={item.node}
              hash={item.hash}
              styleOf={styleOf}
              onMeasured={reportSize}
            />
          ))}
        </div>
      </div>
    );
  }
);

MindMap.displayName = "MindMap";

export default MindMap;
