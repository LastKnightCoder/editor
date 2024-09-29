import { useEffect, useRef, createContext } from "react";
import { useMemoizedFn } from "ahooks";
import { v4 as getUuid } from 'uuid';
import classnames from "classnames";
import WindowControl from "@/components/WindowControl";

import Board from './Board';
import { ViewPortPlugin, MovePlugin, CardPlugin, SelectPlugin, ResizePlugin, GeometryPlugin, RichTextPlugin } from './plugins';
import { ViewPortTransforms } from "./transforms";
import { Selection } from './types';
import useWhiteBoardStore from "./useWhiteBoardStore.ts";
import { useInitBoard } from './hooks';
import styles from './index.module.less';

const viewPortPlugin = new ViewPortPlugin();
const selectPlugin = new SelectPlugin();
const resizePlugin = new ResizePlugin();
const movePlugin = new MovePlugin();

const richTextPlugin = new RichTextPlugin();
const geometryPlugin = new GeometryPlugin();
const cardPlugin = new CardPlugin();

export const BoardContext = createContext<Board | null>(null);
export const SelectionContext = createContext<Selection | null>(null);

const WhiteBoard = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const boardRef = useRef<Board>(new Board([{
    id: getUuid(),
    type: 'card',
    x: 200,
    y: 200,
    width: 400,
    height: 200,
    maxWidth: 400,
    maxHeight: 1000,
    cardId: 200,
    resized: false,
    readonly: false,
    borderWidth: 1,
    borderColor: '#7a7374',
    paddingWidth: 24,
    paddingHeight: 24,
  }, {
    id: getUuid(),
    type: 'geometry',
    x: 300,
    y: 300,
    width: 100,
    height: 100,
    paths: ['M 0 0 L 1 0 L 1 1 L 0 1 Z'],
    fill: '#7a7374',
    fillOpacity: 0.5,
    stroke: 'black',
    strokeWidth: 2
  }, {
    id: getUuid(),
    type: 'geometry',
    x: 100,
    y: 100,
    width: 100,
    height: 100,
    paths: ['M 1,0.5 A 0.5,0.5 0 1,0 0,0.5 A 0.5,0.5 0 1,0 1,0.5', 'M 0 0 L 1 0 L 1 1 L 0 1 Z'],
    fill: 'none',
    stroke: 'red',
    strokeWidth: 2
  }, {
    id: getUuid(),
    type: 'richtext',
    x: 400,
    y: 600,
    width: 52,
    height: 60,
    maxWidth: 300,
    maxHeight: 1000,
    readonly: false,
    content: [{
      type: 'paragraph',
      children: [{
        type: 'formatted',
        text: '',
      }]
    }],
    borderWidth: 2,
    borderColor: '#ed556a',
    paddingWidth: 16,
    paddingHeight: 8,
  }]));

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
      resizePlugin,
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
                {
                  selection.selectedElements && (
                    boardRef.current.renderSelectedRect(selection.selectedElements)
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