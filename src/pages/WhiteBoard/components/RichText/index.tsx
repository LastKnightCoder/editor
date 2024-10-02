import { useState, useRef, useEffect, useMemo, memo } from 'react';
import { Descendant } from 'slate';
import { useMemoizedFn } from 'ahooks';
import useUploadImage from "@/hooks/useUploadImage.ts";
import { cardLinkExtension, fileAttachmentExtension } from "@/editor-extensions";

import Editor, { EditorRef } from '@/components/Editor';
import If from '@/components/If';
import ResizeCircle from '../ResizeCircle';

import useHandleResize from './hooks/useHandleResize';
import useHandlePointer from './hooks/useHandlePointer';
import { 
  SELECT_RECT_STROKE, 
  SELECT_RECT_STROKE_WIDTH, 
  SELECT_RECT_FILL_OPACITY, 
  RESIZE_CIRCLE_FILL, 
  RESIZE_CIRCLE_RADIUS, 
  ARROW_CONNECT_POINT_RADIUS, 
  ARROW_CONNECT_POINT_FILL 
} from '../../constants';
import { Board, BoardElement, EHandlerPosition, Point } from '../../types';
import { RichTextElement, CommonElement } from '../../plugins';
import { PointUtil } from '../../utils';
import { useBoard, useSelectState } from '../../hooks';

import styles from './index.module.less';
import ArrowConnectPoint from '../ArrowConnectPoint';

const customExtensions = [
  cardLinkExtension,
  fileAttachmentExtension
];

type RichTextNoType = Omit<RichTextElement, 'type'> & any;

interface RichtextProps {
  element: RichTextNoType;
  onContentChange: (board: Board, element: RichTextNoType, value: Descendant[]) => void;
  onEditorSizeChange: (board: Board, element: RichTextNoType, width: number, height: number) => void;
  removeAutoFocus?: (board: Board, element: RichTextNoType) => void;
  onResizeStart?: (element: CommonElement & any, startPoint: Point) => void;
  onResizeEnd?: (element: CommonElement & any, endPoint: Point) => void;
  onResize: (board: Board, element: CommonElement & any, position: EHandlerPosition, startPoint: Point, endPoint: Point) => void;
}

const PADDING_WIDTH = 16;
const PADDING_HEIGHT = 12;

const Richtext = memo((props: RichtextProps) => {
  const {
    element,
    onResizeStart,
    onResizeEnd,
    onResize,
    onContentChange,
    onEditorSizeChange,
    removeAutoFocus
  } = props;

  const { 
    x, 
    y, 
    width, 
    height, 
    id: elementId, 
    content, 
    maxWidth, 
    maxHeight, 
    resized,
    readonly,
    autoFocus,
    borderWidth = 0, 
    borderColor, 
    paddingWidth = PADDING_WIDTH, 
    paddingHeight = PADDING_HEIGHT 
  } = element;

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorRef>(null);
  const [initValue] = useState(content);
  const [focus, setFocus] = useState(false);
  const board = useBoard();
  const [isMoving, setIsMoving] = useState(false);
  const {
    isSelected,
    isSelecting,
  } = useSelectState(elementId);

  const resizePoints = PointUtil.getResizePointFromRect({
    x,
    y,
    width,
    height
  });
  const arrowConnectPoints = PointUtil.getArrowConnectPoints(board, {
    x,
    y,
    width,
    height
  });

  const handleFocus = useMemoizedFn(() => {
    if (readonly) return;
    setFocus(true);
  });

  const handleBlur = useMemoizedFn(() => {
    if (readonly) return;
    handleResize.flush();
    setFocus(false);
    // 按道理 blur 的时候取消选中，但是这个时候如果想通过工具栏改变样式就没法做到了
    // 暂时不 deselect 了，后续改为右键菜单的时候在改回来
    // editorRef.current?.deselect();
  });

  const handleOnContentChange = useMemoizedFn((value: Descendant[]) => {
    onContentChange(board, element, value);
  });

  const handleOnEditorSizeChange = useMemoizedFn((width: number, height: number) => {
    onEditorSizeChange(board, element, width, height);
  });

  const handleRemoveAutoFocus = useMemoizedFn(() => {
    removeAutoFocus?.(board, element);
  });

  const handleOnResizeStart = useMemoizedFn((startPoint: Point) => {
    onResizeStart?.(element, startPoint);
  });

  const handleOnResizeEnd = useMemoizedFn((endPoint: Point) => {
    onResizeEnd?.(element, endPoint);
  });

  const handleOnResize = useMemoizedFn((position: EHandlerPosition, startPoint: Point, endPoint: Point) => {
    onResize(board, element, position, startPoint, endPoint);
  });

  const containerStyle = useMemo(() => {
    return {
      userSelect: !focus || isSelecting || isSelected ? 'none' : 'auto',
    } as React.CSSProperties;
  }, [focus, isSelecting, isSelected]);

  const handleAutoFocus = useMemoizedFn(() => {
    if (autoFocus) {
      editorRef.current?.focus();
      handleRemoveAutoFocus();
    }
  });

  useEffect(() => {
    handleAutoFocus()
  }, [handleAutoFocus]);

  const uploadImage = useUploadImage();

  const { handleResize, editorStyle } = useHandleResize({
    handleOnEditorSizeChange,
    maxWidth,
    maxHeight,
    container: containerRef.current,
    resized,
    paddingWidth,
    paddingHeight,
    focus
  });
  useHandlePointer({
    container: containerRef.current,
    paddingWidth,
    paddingHeight,
    isSelected,
    width,
    height
  });

  useEffect(() => {
    const onMovingChange = (movingElements: BoardElement[]) => {
      setIsMoving(movingElements.some(element => element.id === elementId));
    }
    board.on('element:move', onMovingChange);

    return () => {
      board.off('element:move', onMovingChange);
    }
  }, [elementId]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) return;

    const editor = container.querySelector(':scope > [data-slate-editor]');
    if (!editor) return;

    const stopWheelPropagation = (e: WheelEvent) => {
      e.stopPropagation();
    }

    // @ts-expect-error
    editor.addEventListener('wheel', stopWheelPropagation);

    return () => {
      // @ts-expect-error
      editor.removeEventListener('wheel', stopWheelPropagation);
    }
  }, [])

  return (
    <>
      {/* 使用 rect 作为边框而不是 border，是因为放大时拖动内容边框会产生残痕遗留，而 rect 不会 */}
      <rect 
        x={x} 
        y={y} 
        width={width} 
        height={height} 
        stroke={borderColor} 
        strokeWidth={borderWidth} 
        fill='none'
        rx={4} 
        ry={4} 
      />
      <foreignObject
        x={x}
        y={y}
        width={focus && !resized ? maxWidth : width}
        height={focus && !resized ? maxHeight : height}
      >
        <div
          className={styles.richTextContainer}
          ref={containerRef}
          style={containerStyle}
        >
          <Editor
            ref={editorRef}
            style={editorStyle}
            initValue={initValue}
            onChange={handleOnContentChange}
            readonly={isSelected || isMoving || isSelecting || readonly}
            onFocus={handleFocus}
            onBlur={handleBlur}
            uploadImage={uploadImage}
            extensions={customExtensions}
          />
        </div>
      </foreignObject>
      <If condition={isSelected}>
        <g>
          <rect
            x={x}
            y={y}
            rx={4}
            ry={4}
            width={width}
            height={height}
            fillOpacity={SELECT_RECT_FILL_OPACITY}
            stroke={SELECT_RECT_STROKE}
            strokeWidth={SELECT_RECT_STROKE_WIDTH}
          />
          {
            Object.entries(resizePoints).map(([position, point]) => (
              <ResizeCircle
                key={position}
                cx={point.x}
                cy={point.y}
                r={RESIZE_CIRCLE_RADIUS}
                fill={RESIZE_CIRCLE_FILL}
                position={position as EHandlerPosition}
                onResizeStart={handleOnResizeStart}
                onResize={handleOnResize}
                onResizeEnd={handleOnResizeEnd}
              />
            ))
          }
          {
            arrowConnectPoints.map((point) => (
              <ArrowConnectPoint
                key={point.postion}
                position={point.position}
                x={point.point.x}
                y={point.point.y}
                r={ARROW_CONNECT_POINT_RADIUS} 
                fill={ARROW_CONNECT_POINT_FILL}
              />
            ))
          }
        </g>
      </If>
    </>
  )
})

export default Richtext;
