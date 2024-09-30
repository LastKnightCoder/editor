import { useState, useRef, useEffect, useMemo, memo } from 'react';
import { Descendant } from 'slate';
import { useMemoizedFn } from 'ahooks';
import useUploadImage from "@/hooks/useUploadImage.ts";
import { cardLinkExtension, fileAttachmentExtension } from "@/editor-extensions";

import Editor, { EditorRef } from '@/components/Editor';
import useHandleResize from './hooks/useHandleResize';
import useHandlePointer from './hooks/useHandlePointer';
import useSelectState from './hooks/useSelectState';

import styles from './index.module.less';

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
  autoFocus?: boolean;
  removeAutoFocus?: () => void;
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
    paddingHeight = PADDING_HEIGHT,
    autoFocus = false,
    removeAutoFocus
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorRef>(null);
  const [initValue] = useState(content);
  const [focus, setFocus] = useState(false);
  const {
    isSelected,
    isSelecting,
    isMoving,
  } = useSelectState(elementId);

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

  const containerStyle = useMemo(() => {
    return {
      userSelect: !focus || isSelecting || isSelected ? 'none' : 'auto',
    } as React.CSSProperties;
  }, [focus, isSelecting, isSelected]);

  const handleAutoFocus = useMemoizedFn(() => {
    if (autoFocus) {
      editorRef.current?.focus();
      removeAutoFocus?.();
    }
  });

  useEffect(() => {
    handleAutoFocus()
  }, [handleAutoFocus]);

  const uploadImage = useUploadImage();

  const { handleResize, editorStyle } = useHandleResize({
    onResize,
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
    
  const handleOnChange = useMemoizedFn((value: Descendant[]) => {
    onChange(value);
  });

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
            onChange={handleOnChange}
            readonly={isSelected || isMoving || isSelecting || readonly}
            onFocus={handleFocus}
            onBlur={handleBlur}
            uploadImage={uploadImage}
            extensions={customExtensions}
          />
        </div>
      </foreignObject>
    </>
  )
})

export default Richtext;
