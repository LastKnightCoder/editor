import { Graph } from '@antv/g6';
import {useEffect, useMemo, useRef, useState} from "react";
import { useSize } from 'ahooks';
import classnames from "classnames";

import useTheme from "@/hooks/useTheme.ts";
import {ICard} from "@/types";
import Editor, {EditorRef} from "@/components/Editor";

import styles from './index.module.less';

interface ILinkGraphProps {
  cards: ICard[];
  className?: string;
  style?: React.CSSProperties;
  cardWidth?: number;
  cardMaxHeight?: number;
  cardFontSize?: number;
  currentCardId?: number;
}

const LinkGraph = (props: ILinkGraphProps) => {
  const {
    className,
    style,
    cards,
    cardWidth,
    cardMaxHeight,
    cardFontSize,
    currentCardId,
  } = props;
  const ref = useRef<HTMLDivElement>(null);
  const graph = useRef<Graph>();
  const editorRef = useRef<EditorRef>(null);

  const [show, setShow] = useState<boolean>(false);
  const [position, setPosition] = useState<{x: number, y: number}>({x: 0, y: 0});
  const [activeId, setActiveId] = useState<number>(-1);
  const size = useSize(ref);
  const { isDark } = useTheme();

  const content = useMemo(() => {
    if (cards.length === 0 || activeId === -1) return undefined;
    const activeCard = cards.find((card) => card.id === activeId);
    if (!activeCard) return undefined;
    return activeCard.content;
  }, [activeId, cards]);
  
  useEffect(() => {
    if (!editorRef.current || !content) {
      return;
    }
    editorRef.current.setEditorValue(content);
  }, [content]);

  useEffect(() => {
    if (graph.current || !ref.current || cards.length === 0) return;
    const width = ref.current.clientWidth;
    const height = ref.current.clientHeight;
    graph.current = new Graph({
      container: ref.current,
      width,
      height,
      fitView: true,
      fitViewPadding: [40],
      animate: true,
      defaultNode: {
        style: {
          fill: '#C6E5FF',
          stroke: '#5B8FF9',
          lineWidth: 4,
        },
        type: 'circle',
      },
      defaultEdge: {
        style: {
          stroke: isDark ? 'hsl(220, 100%, 35%)' : 'hsl(220, 100%, 70%)',
          lineWidth: 8,
        }
      },
      layout: {
        type: 'force2',
        maxSpeed: 100,
        linkDistance: 100,
        preventOverlap: true,
        workerEnabled: true,
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
      size: card.links.length * 10 + 30,
      style: {
        fill: card.id === currentCardId ? 'rgba(251,185,87,0.58)' : '#C6E5FF',
        stroke: card.id === currentCardId ? '#fbb957' : '#5B8FF9',
        lineWidth: 8,
      }
    })) as any[];
    const edges = cards.map((card) => card.links.map((link) => ({
      source: String(card.id),
      target: String(link),
    }))).flat() as any[];

    graph.current.data({
      nodes,
      edges,
    });
    graph.current.render();

    graph.current.on('node:click', (evt) => {
      const { item } = evt;
      if(!item) return;
      const { id } = item.getModel();
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
      const { top, left } = ref.current!.getBoundingClientRect();
      setShow(true);
      setPosition({x: x - left + 10, y: y - top + 10});
      setActiveId(Number(id));
    });

    graph.current.on('canvas:click', () => {
      graph.current?.getNodes().forEach((node) => {
        graph.current?.clearItemStates(node);
        setShow(false);
        setActiveId(-1);
      });
    });

    return () => {
      if (graph.current) graph.current.destroy();
      graph.current = undefined;
    }
  }, [cards, isDark, currentCardId]);
  
  useEffect(() => {
    if (!graph.current || activeId === -1) return;

    const handleGraphZoomAndMove = () => {
      // 根据节点找到 item，获取其中心位置
      const item = graph.current?.findById(String(activeId));
      if (!item) {
        return;
      }
      const { x, y } = item.getModel();
      if (x === undefined || y === undefined) return;
      const { top, left } = ref.current!.getBoundingClientRect();
      const { width, height } = item.getBBox();
      // 获取画布的缩放比例
      const ratio = graph.current!.getZoom();
      const actualWidth = width * ratio;
      const actualHeight = height * ratio;
      const { x: cx, y: cy } = graph.current!.getClientByPoint(x, y);
      setPosition({x: cx - left + actualWidth / 2, y: cy - top + actualHeight / 2});
    }

    // 图面缩放和移动时重新设置位置
    graph.current.on('canvas:drag', handleGraphZoomAndMove);
    graph.current.on('wheel', handleGraphZoomAndMove);
    
    return () => {
      graph.current?.off('canvas:drag', handleGraphZoomAndMove);
      graph.current?.off('wheel', handleGraphZoomAndMove);
    }
  }, [activeId])

  useEffect(() => {
    if (!ref.current || !graph.current || !size?.width || size?.height) return;
    graph.current.changeSize(size.width, size.height);
  }, [size]);

  return (
    <div className={classnames(styles.container, className)} style={style} ref={ref}>
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
            <Editor ref={editorRef} readonly={true} />
          </div>
        )
      }
    </div>
  )
}

export default LinkGraph;
