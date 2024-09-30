import { useEffect, useRef, createContext } from "react";
import { useMemoizedFn } from "ahooks";
import classnames from "classnames";
import WindowControl from "@/components/WindowControl";

import Board from './Board';
import { ViewPortPlugin, MovePlugin, CardPlugin, SelectPlugin, GeometryPlugin, RichTextPlugin } from './plugins';
import { ViewPortTransforms } from "./transforms";
import { Selection } from './types';
import useWhiteBoardStore from "./useWhiteBoardStore.ts";
import { useInitBoard } from './hooks';
import { mockData } from './mockData'
import styles from './index.module.less';

const viewPortPlugin = new ViewPortPlugin();
const selectPlugin = new SelectPlugin();
const movePlugin = new MovePlugin();

const richTextPlugin = new RichTextPlugin();
const geometryPlugin = new GeometryPlugin();
const cardPlugin = new CardPlugin();

export const BoardContext = createContext<Board | null>(null);
export const SelectionContext = createContext<Selection | null>(null);

const localData = localStorage.getItem('whiteBoardData');
const boardData = localData ? JSON.parse(localData) : mockData;

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
      richTextPlugin,
      geometryPlugin,
      cardPlugin,
      viewPortPlugin,
      selectPlugin,
      movePlugin,
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
        <WindowControl className={styles.windowControl} initAlwaysOnTop/>
      </div>
      <div ref={containerRef} className={styles.whiteBoardContainer}>
        <BoardContext.Provider value={boardRef.current}>
          <SelectionContext.Provider value={selection}>
            <svg ref={svgRef} width={'100%'} height={'100%'} viewBox={`${minX} ${minY} ${width} ${height}`}>
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
          </SelectionContext.Provider>
        </BoardContext.Provider>
      </div>
    </div>
  )
}

export default WhiteBoard;