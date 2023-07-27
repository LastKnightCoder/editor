import { Graph } from '@antv/g6';
import {useEffect, useRef, useState} from "react";
import {ICard} from "@/types";
import {getAllCards} from "@/commands";

const LinkGraph = () => {
  const ref = useRef<HTMLDivElement>(null);
  const graph = useRef<Graph>();
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<ICard[]>([]);

  useEffect(() => {
    setLoading(true);
    getAllCards().then((cards) => {
      setCards(cards);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (graph.current || !ref.current || loading) return;
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
        size: 30,
        style: {
          fill: '#C6E5FF',
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
      }
    });
    const nodes = cards.map((card) => ({
      id: String(card.id),
      size: card.links.length * 5 + 30,
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
  }, [cards, loading]);

  useEffect(() => {
    if (!ref.current) return;
    const resizeObserver = new ResizeObserver(() => {
      if (graph.current) {
        console.log('resize', ref.current!.clientWidth, window.innerHeight);
        graph.current.changeSize(ref.current!.clientWidth, window.innerHeight);
      }
    });
    resizeObserver.observe(ref.current!);
    return () => {
      resizeObserver.disconnect();
    }
  }, [])

  return (
    <div ref={ref}></div>
  )
}

export default LinkGraph;