import { Graph, IG6GraphEvent } from "@antv/g6";
import { useEffect, useRef, useState, memo } from "react";
import classnames from "classnames";
import { useMemoizedFn } from "ahooks";

import { getCardById } from "@/commands";
import useTheme from "@/hooks/useTheme.ts";
import useDynamicExtensions from "@/hooks/useDynamicExtensions";
import { ICard } from "@/types";
import Editor, { EditorRef } from "@/components/Editor";

import styles from "./index.module.less";

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
  const extensions = useDynamicExtensions();

  const handleNodeMouseEnter = useMemoizedFn((evt: IG6GraphEvent) => {
    const { item } = evt;
    if (!item || !graph.current || !isAfterLayout) return;

    const { id } = item.getModel();
    mouseEnterId.current = id;

    setTimeout(() => {
      if (!ref.current || mouseEnterId.current !== id || !graph.current) return;

      // 检查节点是否已经是选中状态
      const isSelected = item.hasState("selected");
      if (!isSelected) {
        // 清除其他节点的选中状态
        graph.current.getNodes().forEach((node) => {
          if (node !== item) {
            graph.current?.clearItemStates(node, "selected");
          }
        });
        // 设置当前节点为选中状态
        graph.current.setItemState(item, "selected", true);
      }

      // 获取位置
      const x = evt.clientX;
      const y = evt.clientY;
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
    }, 500);
  });

  const handleNodeMouseLeave = useMemoizedFn(() => {
    mouseEnterId.current = undefined;
  });

  const handleNodeClick = useMemoizedFn((evt: IG6GraphEvent) => {
    if (
      !ref.current ||
      !isAfterLayout ||
      !graph.current ||
      !initCardsRef.current
    ) {
      return;
    }
    const { item } = evt;
    if (!item) return;
    const { id } = item.getModel();
    if (onClickCard) {
      const card = initCardsRef.current.find((card) => card.id === Number(id));
      if (card) {
        onClickCard(card);
      }
    }
    if (activeId === Number(id)) {
      setActiveId(-1);
      setShow(false);
      graph.current.clearItemStates(item, "selected");
    }
  });

  const handleCanvasClick = useMemoizedFn(() => {
    if (!graph.current || !isAfterLayout) return;
    graph.current.getNodes().forEach((node) => {
      if (!graph.current) return;
      graph.current.clearItemStates(node, "selected");
      setShow(false);
      setActiveId(-1);
    });
  });

  const handleInitialize = useMemoizedFn(
    (cards: ICard[], isDark: boolean, fitViewPadding) => {
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
        fitView,
        fitViewPadding,
        animate: true,
        defaultNode: {
          style: {
            fill: isDark ? "hsl(168, 50%, 20%)" : "hsl(168, 50%, 70%)",
            stroke: isDark ? "hsl(168, 50%, 40%)" : "hsl(168, 50%, 50%)",
            lineWidth: 6,
          },
          type: "circle",
        },
        defaultEdge: {
          style: {
            stroke: isDark ? "hsla(168, 40%, 20%, 50%)" : "hsl(168, 40%, 80%)",
            lineWidth: 8,
          },
        },
        layout: {
          type: "force2",
          maxSpeed: 100,
          linkDistance: 100,
          preventOverlap: true,
          workerEnabled: true,
          nodeSize: 50,
        },
        modes: {
          default: ["drag-canvas", "zoom-canvas"],
        },
        nodeStateStyles: {
          selected: {
            fill: "#91d5ff",
            stroke: "#40a9ff",
            lineWidth: 8,
          },
          current: {
            fill: "rgba(251,185,87,0.58)",
            stroke: "#fbb957",
            lineWidth: 8,
          },
        },
      });
      const nodes = cards.map(
        (card) =>
          ({
            id: String(card.id),
            size: Math.min(getCardLinks(card).length * 10 + 30, 80),
          }) as const,
      );

      const edges = cards
        .map((card) =>
          getCardLinks(card).map(
            (link) =>
              ({
                source: String(card.id),
                target: String(link),
              }) as const,
          ),
        )
        .flat();

      graph.current.data({
        nodes,
        edges,
      });

      graph.current.render();

      graph.current.once("afterlayout", () => {
        setIsAfterLayout(true);
      });

      graph.current.on("node:mouseenter", handleNodeMouseEnter);
      graph.current.on("node:mouseleave", handleNodeMouseLeave);

      graph.current.on("node:click", handleNodeClick);
      graph.current.on("canvas:click", handleCanvasClick);
    },
  );

  const handleCurrentCardIdsChange = useMemoizedFn(
    (currentCardIds: number[] | undefined, isAfterLayout?: boolean) => {
      if (!graph.current || !isAfterLayout) return;
      const currentNodes = graph.current.findAllByState("node", "current");
      currentNodes.forEach((cn) => {
        if (!graph.current) return;
        graph.current.setItemState(cn, "current", false);
      });
      currentCardIds?.forEach((id) => {
        if (!graph.current) return;
        const node = graph.current.findById(String(id));
        if (!node) return;
        graph.current.setItemState(node, "current", true);
      });
    },
  );

  useEffect(() => {
    handleInitialize(initCardsRef.current, isDark, fitViewPadding);

    return () => {
      if (graph.current) graph.current.destroy();
      graph.current = undefined;
    };
  }, [handleInitialize, isDark, fitViewPadding]);

  useEffect(() => {
    handleCurrentCardIdsChange(currentCardIds, isAfterLayout);
  }, [currentCardIds, handleCurrentCardIdsChange, isAfterLayout]);

  useEffect(() => {
    if (!graph.current || !ref.current || activeId === -1 || !isAfterLayout)
      return;

    const handleGraphZoomAndMove = () => {
      if (!graph.current || !ref.current) return;
      // 根据节点找到 item，获取其中心位置
      const item = graph.current.findById(String(activeId));
      if (!item) {
        return;
      }
      const { x, y } = item.getModel();
      if (x === undefined || y === undefined) return;
      const { top, left } = ref.current.getBoundingClientRect();
      const { width, height } = item.getBBox();
      // 获取画布的缩放比例
      const ratio = graph.current.getZoom();
      const actualWidth = width * ratio;
      const actualHeight = height * ratio;
      const { x: cx, y: cy } = graph.current.getClientByPoint(x, y);
      setPosition({
        x: cx - left + actualWidth / 2,
        y: cy - top + actualHeight / 2,
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
      className={classnames(styles.container, className)}
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
              graph.current.changeSize(width, height);
              graph.current.fitView([40], undefined, false);
              prevSize.current = { width, height };
            }
          });
          resizeObserverRef.current.observe(node);
        }
      }}
    >
      {!isAfterLayout && (
        <div className={styles.loadingContainer}>
          <div className={styles.loading} />
        </div>
      )}
      {show && (
        <div
          className={styles.editor}
          style={{
            left: position.x,
            top: position.y,
            width: cardWidth,
            maxHeight: cardMaxHeight,
            fontSize: cardFontSize,
          }}
        >
          <Editor ref={editorRef} readonly={true} extensions={extensions} />
        </div>
      )}
    </div>
  );
});

export default LinkGraph;
