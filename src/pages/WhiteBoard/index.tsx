import { useEffect, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import { InputNumber } from "antd";
import { v4 as getUuid } from 'uuid';
import classnames from "classnames";
import WindowControl from "@/components/WindowControl";

import Board from './Board.ts';
import { RectPlugin, BoardPlugin, CirclePlugin } from './plugins';
import useWhiteBoardStore from "./useWhiteBoardStore.ts";
import { useInitBoard } from './hooks';
import styles from './index.module.less';

const rectPlugin = new RectPlugin();
const boardPlugin = new BoardPlugin();
const circlePlugin = new CirclePlugin();

const WhiteBoard = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  
  const containerWidth = useRef(0);
  const containerHeight = useRef(0);
  const viewBoxMinX = useRef(0);
  const viewBoxMinY = useRef(0);
  const boardRef = useRef<Board>(new Board([{
    id: getUuid(),
    type: 'rect',
    width: 200,
    height: 200,
    x: 100,
    y: 100,
  }, {
    id: getUuid(),
    type: 'circle',
    center: [100, 100],
    radius: 50,
    fill: 'red',
  }]));

  const { value } = useWhiteBoardStore(state => ({
    value: state.value
  }));

  boardRef.current.initPlugins([circlePlugin, rectPlugin, boardPlugin]);

  useInitBoard(boardRef.current, containerRef.current);
  
  const handleContainerResize = useMemoizedFn(() => {
    const container = containerRef.current;
    const svgEle = svgRef.current;
    if (!container || !svgEle) {
      return;
    }

    const width = container.clientWidth;
    const height = container.clientHeight;

    containerWidth.current = width;
    containerHeight.current = height;

    svgEle.style.width = `${width}px`;
    svgEle.style.height = `${height}px`;
    svgEle.setAttribute('viewBox', `${viewBoxMinX.current} ${viewBoxMinY.current} ${width} ${height}`);
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(handleContainerResize);
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
    }
  }, [handleContainerResize]);

  const onOffsetXChange = useMemoizedFn((value: number | null) => {
    if (value === null) return;
    viewBoxMinX.current = value;
    svgRef.current?.setAttribute('viewBox', `${viewBoxMinX.current} ${viewBoxMinY.current} ${containerWidth.current} ${containerHeight.current}`);
  });

  const onOffsetYChange = useMemoizedFn((value: number | null) => {
    if (value === null) return;
    viewBoxMinY.current = value;
    svgRef.current?.setAttribute('viewBox', `${viewBoxMinX.current} ${viewBoxMinY.current} ${containerWidth.current} ${containerHeight.current}`);
  });

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
        <svg ref={svgRef} width={'100%'} height={'100%'}>
          <g>
            {boardRef.current.renderElements(value)}
          </g>
        </svg>
      </div>
      <div className={styles.control}>
        <InputNumber<number> onChange={onOffsetXChange} />
        <InputNumber<number> onChange={onOffsetYChange} />
      </div>
    </div>
  )
}

export default WhiteBoard;