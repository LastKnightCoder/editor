import { useEffect, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import { v4 as getUuid } from 'uuid';
import classnames from "classnames";
import WindowControl from "@/components/WindowControl";

import Board from './Board.ts';
import { RectPlugin, ViewPortPlugin, CirclePlugin, MovePlugin, CardPlugin } from './plugins';
import { ViewPortTransforms } from "./transforms";
import useWhiteBoardStore from "./useWhiteBoardStore.ts";
import { useInitBoard } from './hooks';
import styles from './index.module.less';

const rectPlugin = new RectPlugin();
const viewPortPlugin = new ViewPortPlugin();
const circlePlugin = new CirclePlugin();
const movePlugin = new MovePlugin();
const cardPlugin = new CardPlugin();

const WhiteBoard = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const boardRef = useRef<Board>(new Board([{
    id: getUuid(),
    type: 'rect',
    width: 200,
    height: 200,
    x: 300,
    y: 375,
  }, {
    id: getUuid(),
    type: 'circle',
    center: [100, 100],
    radius: 50,
    fill: 'red',
  }, {
    id: getUuid(),
    type: 'card',
    x: 200,
    y: 200,
    width: 400,
    height: 200,
    cardId: 200,
  }]));

  const { children, viewPort } = useWhiteBoardStore(state => ({
    children: state.children,
    viewPort: state.viewPort,
  }));

  const { minX, minY, width, height } = viewPort;

  useInitBoard(boardRef.current, containerRef.current, [movePlugin, circlePlugin, rectPlugin, cardPlugin, viewPortPlugin]);
  
  const handleContainerResize = useMemoizedFn(() => {
    ViewPortTransforms.onContainerResize(boardRef.current);
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(handleContainerResize);
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
    }
  }, [handleContainerResize]);

  return (
    <div className={classnames(styles.whiteBoardPageContainer)}>
      <div
        data-tauri-drag-region
        className={styles.titleBar}
      >
        <div className={styles.title}>白板</div>
        <WindowControl className={styles.windowControl} initAlwaysOnTop/>
      </div>
      <div ref={containerRef} className={styles.whiteBoardContainer}>
        <svg ref={svgRef} width={'100%'} height={'100%'} viewBox={`${minX} ${minY} ${width} ${height}`}>
          <g>
            {boardRef.current.renderElements(children)}
          </g>
        </svg>
      </div>
    </div>
  )
}

export default WhiteBoard;