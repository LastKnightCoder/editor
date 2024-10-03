import { useEffect, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import classnames from "classnames";
import WindowControl from "@/components/WindowControl";

import Board from './Board';
import { ViewPortPlugin, MovePlugin, CardPlugin, SelectPlugin, GeometryPlugin, RichTextPlugin, ArrowPlugin, ImagePlugin } from './plugins';
import { ViewPortTransforms } from "./transforms";
import useWhiteBoardStore from "./useWhiteBoardStore.ts";
import { useInitBoard } from './hooks';
import { BoardContext, SelectionContext, ViewPortContext } from './context';
import { mockData } from './mockData'
import styles from './index.module.less';

const viewPortPlugin = new ViewPortPlugin();
const selectPlugin = new SelectPlugin();
const movePlugin = new MovePlugin();

const arrowPlugin = new ArrowPlugin();
const richTextPlugin = new RichTextPlugin();
const geometryPlugin = new GeometryPlugin();
const cardPlugin = new CardPlugin();
const imagePlugin = new ImagePlugin();

const localData = localStorage.getItem('whiteBoardData');
const boardData = localData ? JSON.parse(localData) : mockData;

const ARROW_SIZE = 8;

const WhiteBoard = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const boardRef = useRef<Board>(new Board(boardData));

  const { children, viewPort, selection } = useWhiteBoardStore(state => ({
    children: state.children,
    viewPort: state.viewPort,
    selection: state.selection,
  }));

  const { minX, minY, width, height } = viewPort;

  useInitBoard(
    boardRef.current,
    containerRef.current,
    [
      arrowPlugin,
      richTextPlugin,
      cardPlugin,
      geometryPlugin,
      imagePlugin,
      selectPlugin,
      movePlugin,
      viewPortPlugin,
    ]
  );

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
        <WindowControl className={styles.windowControl} initAlwaysOnTop />
      </div>
      <div ref={containerRef} className={styles.whiteBoardContainer}>
        <BoardContext.Provider value={boardRef.current}>
          <SelectionContext.Provider value={selection}>
            <ViewPortContext.Provider value={viewPort}>
              <svg ref={svgRef} width={'100%'} height={'100%'} viewBox={`${minX} ${minY} ${width} ${height}`}>
                <defs>
                  <marker
                    id={`whiteboard-arrow`}
                    markerWidth={ARROW_SIZE}
                    markerHeight={ARROW_SIZE}
                    // 箭头太细了，盖不住底下的线，向右偏移一点
                    refX={ARROW_SIZE - 0.5}
                    refY={ARROW_SIZE / 2}
                    orient="auto-start-reverse"
                    markerUnits="strokeWidth"
                  >
                    <path
                      d={`M0,0 L2,${ARROW_SIZE / 2} L0,${ARROW_SIZE} L${ARROW_SIZE},${ARROW_SIZE / 2} Z`}
                      fill={'context-stroke'}
                      strokeLinejoin="round"
                      strokeWidth={1}
                      stroke={'context-stroke'}
                    />
                  </marker>
                </defs>
                <g>
                  {boardRef.current.renderElements(children)}
                </g>
                <g>
                  {
                    selection.selectArea && (
                      <rect
                        x={Math.min(selection.selectArea.anchor.x, selection.selectArea.focus.x)}
                        y={Math.min(selection.selectArea.anchor.y, selection.selectArea.focus.y)}
                        width={Math.abs(selection.selectArea.anchor.x - selection.selectArea.focus.x)}
                        height={Math.abs(selection.selectArea.anchor.y - selection.selectArea.focus.y)}
                        fill={'rgb(62,103,187)'}
                        fillOpacity={0.2}
                        stroke={'rgb(62,103,187)'}
                        strokeWidth={1}
                        style={{
                          pointerEvents: 'none',
                        }}
                      />
                    )
                  }
                </g>
              </svg>
            </ViewPortContext.Provider>
          </SelectionContext.Provider>
        </BoardContext.Provider>
      </div>
    </div>
  )
}

export default WhiteBoard;