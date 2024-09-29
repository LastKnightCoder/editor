import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { Descendant } from 'slate';
import { useMemoizedFn, useDebounceFn } from 'ahooks';
import useUploadImage from "@/hooks/useUploadImage.ts";
import { cardLinkExtension, fileAttachmentExtension } from "@/editor-extensions";
import styles from './index.module.less';

import Editor, { EditorRef } from '@/components/Editor';
import { useSelection } from '../../hooks/useSelection';
import { useBoard } from '../../hooks/useBoard';
import { PointUtil } from '../../utils';

const customExtensions = [
  cardLinkExtension,
  fileAttachmentExtension
];

interface RichtextProps {
  elementId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  content: Descendant[];
  maxWidth: number;
  maxHeight: number;
  resized: boolean;
  onChange: (value: Descendant[]) => void;
  onResize: (width: number, height: number) => void;
  borderWidth?: number;
  borderColor?: string;
  paddingWidth?: number;
  paddingHeight?: number;
  readonly?: boolean;
}

const PADDING_WIDTH = 16;
const PADDING_HEIGHT = 12;

const Richtext = memo((props: RichtextProps) => {
  const {
    elementId,
    x,
    y,
    width,
    height,
    content,
    onChange,
    onResize,
    maxWidth,
    maxHeight,
    readonly,
    resized,
    borderColor = 'transparent',
    borderWidth = 0,
    paddingWidth = PADDING_WIDTH,
    paddingHeight = PADDING_HEIGHT
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorRef>(null);

  const [initValue] = useState(content);
  const [focus, setFocus] = useState(false);

  const selection = useSelection();
  const board = useBoard();
  const isSelected = selection?.selectedElements.some(element => element.id === elementId);
  const isMoving = board?.movingElements.some(element => element.id === elementId);

  const uploadImage = useUploadImage();

  const handleFocus = useMemoizedFn(() => {
    if (readonly) return;
    setFocus(true);
  });

  const handleBlur = useMemoizedFn(() => {
    if (readonly) return;
    handleResize.flush();
    setFocus(false);
    editorRef.current?.deselect();
  });

  const { run: handleResize } = useDebounceFn((entries: ResizeObserverEntry[]) => {
    const entry = entries[0];
    const { blockSize, inlineSize } = entry.borderBoxSize[0];
    onResize(Math.min(maxWidth, inlineSize), Math.min(maxHeight, blockSize));
  }, { wait: 100 });

  const handleOnChange = useMemoizedFn((value: Descendant[]) => {
    onChange(value);
  });

  const handleFirstResize = useMemoizedFn((width: number, height: number) => {
    onResize(width, height);
  });

  const handlePointerDown = useMemoizedFn((e: React.PointerEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const currentPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    const { x, y } = container.getBoundingClientRect();
    const containerPoint = PointUtil.screenToViewPort(board, x, y);
    if (!currentPoint || !containerPoint) return;
    const offsetX = currentPoint.x - containerPoint.x;
    const offsetY = currentPoint.y - containerPoint.y;
    const hitWidth = paddingWidth - 2;
    const hitHeight = paddingHeight - 2;
    // offsetX 和 offsetY 在 padding 中
    const isHitPadding = offsetX < hitWidth || offsetX > width - hitWidth || offsetY < hitHeight || offsetY > height - hitHeight;
    if (!isSelected && !isHitPadding) {
      e.stopPropagation();
    }
  });

  // 鼠标样式
  const handleOnPointerMove = useMemoizedFn((e: React.PointerEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const currentPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    const { x, y } = container.getBoundingClientRect();
    const containerPoint = PointUtil.screenToViewPort(board, x, y);
    if (!currentPoint || !containerPoint) return;
    const offsetX = currentPoint.x - containerPoint.x;
    const offsetY = currentPoint.y - containerPoint.y;
    // 没有内容的时候方便编辑
    const hitWidth = paddingWidth - 2;
    const hitHeight = paddingHeight - 2;
    const isHitPadding = offsetX < hitWidth || offsetX > width - hitWidth || offsetY < hitHeight || offsetY > height - hitHeight;
    if (isHitPadding || isSelected) {
      container.style.cursor = 'move';
    } else {
      // 可编辑的样式
      container.style.cursor = 'text';
    }
  })

  const isSelecting = useMemo(() => {
    return !!selection?.selectArea;
  }, [selection?.selectArea]);

  const editorStyle = useMemo(() => {
    return {
      width: resized ? maxWidth : 'fit-content',
      height: resized ? maxHeight : 'auto',
      overflow: 'auto',
      boxSizing: 'border-box',
      padding: `${paddingHeight}px ${paddingWidth}px`,
      maxWidth,
      maxHeight,
    } as React.CSSProperties;
  }, [maxWidth, maxHeight, resized, paddingWidth, paddingHeight]);

  const containerStyle = useMemo(() => {
    return {
      userSelect: !focus || isSelecting || isSelected ? 'none' : 'auto',
    } as React.CSSProperties;
  }, [focus, isSelecting, isSelected]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || resized) return;

    const observer = new ResizeObserver(handleResize);
    const editor = container.querySelector(':scope > [data-slate-editor]');
    if (!editor) return;

    observer.observe(editor);

    return () => {
      observer.disconnect();
    }
  }, [handleResize, resized]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || resized) return;

    const editor = container.querySelector(':scope > [data-slate-editor]');
    if (!editor) return;

    const { width, height } = editor.getBoundingClientRect();
    handleFirstResize(width, height);
  }, [resized, handleFirstResize]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // @ts-expect-error
    container.addEventListener('pointerdown', handlePointerDown);
    // @ts-expect-error
    container.addEventListener('pointermove', handleOnPointerMove);

    return () => {
      // @ts-expect-error
      container.removeEventListener('pointerdown', handlePointerDown);
      // @ts-expect-error
      container.removeEventListener('pointermove', handleOnPointerMove);
    }
  }, [handlePointerDown, handleOnPointerMove]);

  return (
    <>
      {/* 使用 rect 作为边框而不是 border，是因为放大时拖动内容边框会产生残痕遗留，而 rect 不会*/}
      {/* 使用 rect 的问题就是宽度变化时没那么流畅，有种卡顿感 */}
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
            onChange={handleOnChange}
            readonly={isSelected || isMoving || isSelecting || readonly}
            onFocus={handleFocus}
            onBlur={handleBlur}
            uploadImage={uploadImage}
            extensions={customExtensions}
            placeHolder={'  '}
          />
        </div>
      </foreignObject>
    </>
  )
})

export default Richtext;
