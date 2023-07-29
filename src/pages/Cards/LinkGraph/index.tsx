import { Graph } from '@antv/g6';
import {useEffect, useMemo, useRef, useState} from "react";
import {ICard} from "@/types";
import {getAllCards} from "@/commands";
import Editor, {EditorRef} from "@/components/Editor";
import styles from './index.module.less';

const LinkGraph = () => {
  const ref = useRef<HTMLDivElement>(null);
  const graph = useRef<Graph>();
  const editorRef = useRef<EditorRef>(null);
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<ICard[]>([]);

  const [show, setShow] = useState<boolean>(false);
  const [position, setPosition] = useState<{x: number, y: number}>({x: 0, y: 0});
  const [activeId, setActiveId] = useState<number>(-1);
  
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
    setLoading(true);
    getAllCards().then((cards) => {
      setCards(cards);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (graph.current || !ref.current || loading || cards.length === 0) return;
    const width = ref.current.clientWidth;
    const height = window.innerHeight;
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
          lineWidth: 5,
        },
        type: 'circle',
      },
      layout: {
        type: 'force2',
        maxSpeed: 100,
        linkDistance: 100,
        preventOverlap: true,
        workerEnabled: true,
        gpuEnabled: true,
      },
      modes: {
        default: ['drag-canvas', 'zoom-canvas']
      },
      nodeStateStyles: {
        selected: {
          fill: '#91d5ff',
          stroke: '#40a9ff',
          lineWidth: 8,
        }
      }
    });
    const nodes = cards.map((card) => ({
      id: String(card.id),
      size: card.links.length * 10 + 30,
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
    }
  }, [cards, loading]);
  
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
    if (!ref.current || !graph.current) return;
    const resizeObserver = new ResizeObserver(() => {
      if (ref.current && graph.current && graph.current.changeSize) {
        graph.current.changeSize(ref.current.clientWidth, window.innerHeight);
      }
    });
    resizeObserver.observe(ref.current);
    return () => {
      resizeObserver.disconnect();
    }
  }, [])

  return (
    <div ref={ref}>
      {
        show && (
          <div className={styles.editor} style={{ left: position.x, top: position.y }}>
            <Editor ref={editorRef} readonly={true} />
          </div>
        )
      }
    </div>
  )
}

export default LinkGraph;
