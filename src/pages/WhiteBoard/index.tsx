import { useEffect, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import { InputNumber } from "antd";
import { v4 as getUuid } from 'uuid';
import classnames from "classnames";
import WindowControl from "@/components/WindowControl";

import Board from './Board.ts';
import { RectPlugin, ViewPortPlugin, CirclePlugin } from './plugins';
import { ViewPortTransforms } from "./transforms";
import useWhiteBoardStore from "./useWhiteBoardStore.ts";
import { useInitBoard } from './hooks';
import styles from './index.module.less';

const rectPlugin = new RectPlugin();
const viewPortPlugin = new ViewPortPlugin();
const circlePlugin = new CirclePlugin();

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
  }]));

  const { value, viewPort } = useWhiteBoardStore(state => ({
    value: state.value,
    viewPort: state.viewPort,
  }));

  const { minX, minY, width, height, zoom } = viewPort;

  useInitBoard(boardRef.current, containerRef.current, [circlePlugin, rectPlugin, viewPortPlugin]);
  
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

  const onOffsetXChange = useMemoizedFn((value: number | null) => {
    if (value === null) return;
    boardRef.current.apply({
      type: 'set_viewport',
      properties: boardRef.current.viewPort,
      newProperties: {
        minX: value
      }
    })
  });

  const onOffsetYChange = useMemoizedFn((value: number | null) => {
    if (value === null) return;
    boardRef.current.apply({
      type: 'set_viewport',
      properties: boardRef.current.viewPort,
      newProperties: {
        minY: value
      }
    })
  });

  const handleZoomChange = useMemoizedFn((value: number | null) => {
    if (value === null) return;
    ViewPortTransforms.updateZoom(boardRef.current, value);
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
        <svg ref={svgRef} width={'100%'} height={'100%'} viewBox={`${minX} ${minY} ${width} ${height}`}>
          <g>
            {boardRef.current.renderElements(value)}
          </g>
        </svg>
      </div>
      <div className={styles.control}>
        <InputNumber<number> value={minX} onChange={onOffsetXChange} />
        <InputNumber<number> value={minY} onChange={onOffsetYChange} />
        <InputNumber<number> min={0.1} max={10} step={0.1} value={zoom} onChange={handleZoomChange} />
      </div>
    </div>
  )
}

export default WhiteBoard;