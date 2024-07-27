import { Graph, IG6GraphEvent } from '@antv/g6';
import { useEffect, useMemo, useRef, useState, memo } from "react";
import classnames from "classnames";
import { useMemoizedFn } from "ahooks";

import useTheme from "@/hooks/useTheme.ts";
import { ICard } from "@/types";
import Editor, { EditorRef } from "@/components/Editor";
import { cardLinkExtension, fileAttachmentExtension } from "@/editor-extensions";

import styles from './index.module.less';

const customExtensions = [cardLinkExtension, fileAttachmentExtension];

interface ILinkGraphProps {
  cards: ICard[];
  getCardLinks?: (card: ICard) => number[];
  className?: string;
  style?: React.CSSProperties;
  cardWidth?: number;
  cardMaxHeight?: number;
  cardFontSize?: number;
  currentCardId?: number;
  fitView?: boolean;
  onClickCard?: (id: number) => void;
}

const LinkGraph = memo((props: ILinkGraphProps) => {
  const {
    className,
    style,
    cards,
    cardWidth,
    cardMaxHeight,
    cardFontSize,
    currentCardId,
    getCardLinks = (card) => card.links,
    fitView = true,
    onClickCard
  } = props;
  const ref = useRef<HTMLDivElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver>();
  const graph = useRef<Graph>();
  const editorRef = useRef<EditorRef>(null);
  const prevSize = useRef<{ width: number, height: number }>({ width: 0, height: 0 });
  const mouseEnterId = useRef<string>();

  const [show, setShow] = useState<boolean>(false);
  const [position, setPosition] = useState<{x: number, y: number}>({ x: 0, y: 0 });
  const [activeId, setActiveId] = useState<number>(-1);
  const { isDark } = useTheme();

  const content = useMemo(() => {
    if (cards.length === 0 || activeId === -1) return undefined;
    const activeCard = cards.find((card) => card.id === activeId);
    if (!activeCard) return undefined;
    return activeCard.content;
  }, [activeId, cards]);

  const handleNodeMouseEnter = useMemoizedFn((evt: IG6GraphEvent) => {
    const { item } = evt;
    if(!item) return;
    const { id } = item.getModel();
    mouseEnterId.current = id;
    setTimeout(() => {
      if (!ref.current || mouseEnterId.current !== id) return;
      graph.current?.setItemState(item, 'selected', true);
      graph.current?.getNodes().forEach((node) => {
        if (node !== item) {
          graph.current?.clearItemStates(node, 'selected');
        }
      });
      // 获取位置
      const x = evt.clientX;
      const y = evt.clientY;
      // 获取容器偏移量
      const { top, left } = ref.current.getBoundingClientRect();
      setShow(true);
      setPosition({ x: x - left + 10, y: y - top + 10 });
      setActiveId(Number(id));
    }, 500)
  });

  const handleNodeMouseLeave = useMemoizedFn(() => {
    mouseEnterId.current = undefined;
  });
  
  useEffect(() => {
    if (!editorRef.current || !content) {
      return;
    }
    editorRef.current.setEditorValue(content);
  }, [content]);

  useEffect(() => {
    if (!ref.current) return;
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
      fitViewPadding: [40],
      animate: true,
      defaultNode: {
        style: {
          fill: isDark ? '#308cdc' : '#8cb8d0',
          stroke: isDark ? '#316adc' : '#096DD9',
          lineWidth: 4,
        },
        type: 'circle',
      },
      defaultEdge: {
        style: {
          stroke: isDark ? 'hsla(218,6%,51%,0.92)' : 'hsla(216,8%,63%,0.37)',
          lineWidth: 4,
        }
      },
      layout: {
        type: 'force2',
        maxSpeed: 100,
        linkDistance: 100,
        preventOverlap: true,
        workerEnabled: true,
        nodeSize: 50
      },
      modes: {
        default: ['drag-canvas', 'zoom-canvas']
      },
      nodeStateStyles: {
        selected: {
          fill: '#91d5ff',
          stroke: '#40a9ff',
          lineWidth: 8,
        },
        focus: {
          fill: 'rgba(251,185,87,0.58)',
          stroke: '#fbb957',
          lineWidth: 8,
        }
      }
    });
    const nodes = cards.map((card) => ({
      id: String(card.id),
      size: Math.min(getCardLinks(card).length * 10 + 30, 80),
      style: {
        fill: card.id === currentCardId ? 'rgba(251,185,87,0.58)' : '#e0eaf1',
        stroke: card.id === currentCardId ? '#fbb957' : '#799eee',
        lineWidth: 4,
      }
    }) as const);
    const edges = cards.map((card) => getCardLinks(card).map((link) => ({
      source: String(card.id),
      target: String(link),
    }) as const)).flat();

    graph.current.data({
      nodes,
      edges,
    });
    graph.current.render();

    graph.current.on('node:mouseenter', handleNodeMouseEnter);
    graph.current.on('node:mouseleave', handleNodeMouseLeave);

    graph.current.on('node:click', (evt) => {
      if (!ref.current) return;
      const { item } = evt;
      if(!item) return;
      const { id } = item.getModel();
      if (onClickCard) {
        onClickCard(Number(id));
      }
    });

    graph.current.on('canvas:click', () => {
      if (!graph.current) return;
      graph.current.getNodes().forEach((node) => {
        if (!graph.current) return;
        graph.current.clearItemStates(node);
        setShow(false);
        setActiveId(-1);
      });
    });

    return () => {
      if (graph.current) graph.current.destroy();
      graph.current = undefined;
    }
  }, [cards, isDark, currentCardId, fitView, getCardLinks, onClickCard, handleNodeMouseEnter, handleNodeMouseLeave]);
  
  useEffect(() => {
    if (!graph.current || !ref.current || activeId === -1) return;

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
      setPosition({ x: cx - left + actualWidth / 2, y: cy - top + actualHeight / 2 });
    }

    // 图面缩放和移动时重新设置位置
    graph.current.on('canvas:drag', handleGraphZoomAndMove);
    graph.current.on('wheel', handleGraphZoomAndMove);
    
    return () => {
      if (!graph.current) return;
      graph.current.off('canvas:drag', handleGraphZoomAndMove);
      graph.current.off('wheel', handleGraphZoomAndMove);
    }
  }, [activeId]);

  return (
    <div
      className={classnames(styles.container, className)}
      style={style}
      ref={node => {
        if (node) {
          ref.current = node;
          if (resizeObserverRef.current) {
            resizeObserverRef.current.disconnect();
          }
          resizeObserverRef.current = new ResizeObserver(() => {
            if (graph.current) {
              const width = node.clientWidth;
              const height = node.clientHeight;
              if (prevSize.current.width === width && prevSize.current.height === height) {
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
      {
        show && (
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
            <Editor 
              ref={editorRef} 
              readonly={true}
              extensions={customExtensions}
            />
          </div>
        )
      }
    </div>
  )
})

export default LinkGraph;
