import { memo, useMemo, useEffect, useRef, useSyncExternalStore } from "react";
import { useMemoizedFn, useCreation } from "ahooks";
import classnames from 'classnames';

import Board from './Board';
import { 
  ViewPortPlugin, 
  MovePlugin, 
  HistoryPlugin,
  CopyPastePlugin,
  CardPlugin, 
  SelectPlugin, 
  GeometryPlugin, 
  RichTextPlugin, 
  ArrowPlugin, 
  ImagePlugin,
  VideoPlugin,
} from './plugins';
import { ViewPortTransforms } from "./transforms";
import { BoardContext, SelectionContext, ViewPortContext } from './context';
import { BOARD_TO_CONTAINER, ARROW_SIZE } from "./constants";
import { BoardElement, Events, ViewPort, Selection } from "./types";
import Toolbar from './components/Toolbar';
import SelectArea from './components/SelectArea';
import ComponentConfig from "./components/ComponentConfig";
import styles from './index.module.less';
import PortalToBody from "@/components/PortalToBody";

const viewPortPlugin = new ViewPortPlugin();
const selectPlugin = new SelectPlugin();
const movePlugin = new MovePlugin();
const historyPlugin = new HistoryPlugin();
const copyPastePlugin = new CopyPastePlugin();

const arrowPlugin = new ArrowPlugin();
const richTextPlugin = new RichTextPlugin();
const geometryPlugin = new GeometryPlugin();
const cardPlugin = new CardPlugin();
const imagePlugin = new ImagePlugin();
const videoPlugin = new VideoPlugin();

const plugins = [
  arrowPlugin,
  geometryPlugin,
  cardPlugin,
  richTextPlugin,
  imagePlugin,
  videoPlugin,
  historyPlugin,
  selectPlugin,
  movePlugin,
  viewPortPlugin,
  copyPastePlugin
]

interface WhiteBoardProps {
  className?: string;
  style?: React.CSSProperties;
  initData: BoardElement[];
  initViewPort?: ViewPort;
  initSelection?: Selection;
  onChange?: (data: { children: BoardElement[], viewPort: ViewPort, selection: Selection }) => void;
}

const WhiteBoard = memo((props: WhiteBoardProps) => {
  const { 
    className,
    style,
    initData, 
    initViewPort = { minX: 0, minY: 0, width: 0, height: 0, zoom: 1 }, 
    initSelection = { selectArea: null, selectedElements: [] as BoardElement[] },
    onChange
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const board = useCreation<Board>(() => new Board(initData, initViewPort, initSelection, plugins), []);
  
  const { children, viewPort, selection } = useSyncExternalStore(board.subscribe, board.getSnapshot);
  const { minX, minY, width, height } = viewPort;

  const [centerConnectArrows, noneCenterConnectArrows] = useMemo(() => {
    const isCenterConnectAndNotSelected = (element: BoardElement) => {
      const isCenterConnectArrow = element.type === 'arrow' && (element.source?.connectId === 'center' || element.target?.connectId === 'center');
      const isSelected = selection.selectedElements.some((selectedElement) => selectedElement.id === element.id);
      return isCenterConnectArrow && !isSelected;
    }

    const centerConnectArrows = children.filter(isCenterConnectAndNotSelected);
    const noneCenterConnectArrows = children.filter((element) => !isCenterConnectAndNotSelected(element));

    return [centerConnectArrows, noneCenterConnectArrows];
  }, [children, selection]);

  useEffect(() => {
    const handleChange = () => {
      onChange?.(board.getSnapshot())
    }
    board.on('change', handleChange);

    return () => {
      board.off('change', handleChange);
    }
  }, [board, onChange]);

  const eventHandlerGenerator = useMemoizedFn((eventName: Events) => {
    return (event: any) => {
      board[eventName](event);
    }
  });

  const handleContainerResize = useMemoizedFn(() => {
    ViewPortTransforms.onContainerResize(board);
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    BOARD_TO_CONTAINER.set(board, container);

    const handleMouseDown = eventHandlerGenerator('onMouseDown');
    const handleMouseMove = eventHandlerGenerator('onMouseMove');
    const handleMouseUp = eventHandlerGenerator('onMouseUp');
    const handleMouseEnter = eventHandlerGenerator('onMouseEnter');
    const handleMouseLeave = eventHandlerGenerator('onMouseLeave');
    const handleContextMenu = eventHandlerGenerator('onContextMenu');
    const handleClick = eventHandlerGenerator('onClick');
    const handleDblClick = eventHandlerGenerator('onDblClick');
    const handleKeyDown = eventHandlerGenerator('onKeyDown');
    const handleKeyUp = eventHandlerGenerator('onKeyUp');
    const handleGlobalMouseDown = eventHandlerGenerator('onGlobalMouseDown');
    const handleGlobalMouseUp = eventHandlerGenerator('onGlobalMouseUp');
    const handleOnWheel = eventHandlerGenerator('onWheel');
    const handleOnPointerDown = eventHandlerGenerator('onPointerDown');
    const handleOnPointerMove = eventHandlerGenerator('onPointerMove');
    const handleOnPointerUp = eventHandlerGenerator('onPointerUp');
    const handleOnGlobalPointerDown = eventHandlerGenerator('onGlobalPointerDown');
    const handleOnGlobalPointerMove = eventHandlerGenerator('onGlobalPointerMove');
    const handleOnGlobalPointerUp = eventHandlerGenerator('onGlobalPointerUp');
    const handleOnPaste = eventHandlerGenerator('onPaste');
    const handleOnCopy = eventHandlerGenerator('onCopy');
    const handleOnCut = eventHandlerGenerator('onCut');

    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('mouseenter', handleMouseEnter);
    container.addEventListener('mouseleave', handleMouseLeave);

    container.addEventListener('contextmenu', handleContextMenu);
    container.addEventListener('click', handleClick);
    container.addEventListener('dblclick', handleDblClick);

    container.addEventListener('pointerdown', handleOnPointerDown);
    container.addEventListener('pointermove', handleOnPointerMove);
    container.addEventListener('pointerup', handleOnPointerUp);

    document.addEventListener('paste', handleOnPaste);
    document.addEventListener('copy', handleOnCopy);
    document.addEventListener('cut', handleOnCut);

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    document.addEventListener('mousedown', handleGlobalMouseDown);
    document.addEventListener('mouseup', handleGlobalMouseUp);
    document.addEventListener('wheel', handleOnWheel);

    document.addEventListener('pointerdown', handleOnGlobalPointerDown);
    document.addEventListener('pointermove', handleOnGlobalPointerMove);
    document.addEventListener('pointerup', handleOnGlobalPointerUp);

    const observer = new ResizeObserver(handleContainerResize);
    observer.observe(container);

    return () => {
      document.removeEventListener('mousedown', handleGlobalMouseDown);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('wheel', handleOnWheel);
      document.removeEventListener('pointerdown', handleOnGlobalPointerDown);
      document.removeEventListener('pointermove', handleOnGlobalPointerMove);
      document.removeEventListener('pointerup', handleOnGlobalPointerUp);
      document.removeEventListener('paste', handleOnPaste);
      document.removeEventListener('copy', handleOnCopy);
      document.removeEventListener('cut', handleOnCut);
      if (container) {
        container.removeEventListener('mousedown', handleMouseDown);
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('mouseup', handleGlobalMouseUp);
        container.removeEventListener('mouseenter', handleMouseEnter);
        container.removeEventListener('mouseleave', handleMouseLeave);
        container.removeEventListener('contextmenu', handleContextMenu);
        container.removeEventListener('click', handleClick);
        container.removeEventListener('dblclick', handleDblClick);
        container.removeEventListener('pointerdown', handleOnPointerDown);
        container.removeEventListener('pointermove', handleOnPointerMove);
        container.removeEventListener('pointerup', handleOnPointerUp);
        
      }
      observer.disconnect();
      board.destroy();
    }
  }, [board, eventHandlerGenerator, handleContainerResize]);

  const lines = board.refLine.getAllRefLines();

  return (
    <div ref={containerRef} className={classnames(styles.boardContainer, className)} style={style}>
      <BoardContext.Provider value={board}>
        <SelectionContext.Provider value={selection}>
          <ViewPortContext.Provider value={viewPort}>
            <Toolbar />
            <svg ref={svgRef} width={'100%'} height={'100%'} viewBox={`${minX} ${minY} ${width} ${height}`}>
              <defs>
                <marker
                  id={`whiteboard-arrow`}
                  markerWidth={ARROW_SIZE}
                  markerHeight={ARROW_SIZE}
                  // 箭头太细了，盖不住底下的线，向左偏移一点
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
                {board.renderElements(centerConnectArrows)}
              </g>
              <g>
                {board.renderElements(noneCenterConnectArrows)}
              </g>
              <g>
                <SelectArea />
              </g>
              <g>
                {
                  lines.map((line, i) => (
                    <line
                      key={i}
                      x1={line.left}
                      y1={line.top}
                      x2={line.type === 'vertical' ? line.left : line.left + line.size}
                      y2={line.type === 'vertical' ? line.top + line.size : line.top}
                      stroke={'gray'}
                      strokeWidth={2}
                      strokeDasharray={'5,5'}
                    />
                  ))
                }
              </g>
            </svg>
            <PortalToBody>
              <div className={classnames(styles.attributeBar, { [styles.hide]: selection.selectedElements.length !== 1 })}>
                <ComponentConfig />
              </div>
            </PortalToBody>
          </ViewPortContext.Provider>
        </SelectionContext.Provider>
      </BoardContext.Provider>
    </div>
  )
})

export default WhiteBoard;

export * from './types';
