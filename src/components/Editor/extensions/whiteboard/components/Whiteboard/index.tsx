import React, { useState, useRef } from "react";
import { useReadOnly } from "slate-react";
import {
  MdDragIndicator,
  MdFullscreen,
  MdFullscreenExit,
} from "react-icons/md";
import { createPortal } from "react-dom";
import { ReactEditor, useSlate } from "slate-react";
import { Transforms } from "slate";
import classnames from "classnames";

import { WhiteboardElement } from "@/components/Editor/types/element/whiteboard.ts";
import { IExtensionBaseProps } from "@/components/Editor/extensions/types";
import WhiteBoard from "@/components/WhiteBoard";
import If from "@/components/If";
import {
  BoardElement,
  ViewPort,
  Selection,
} from "@/components/WhiteBoard/types";

import styles from "./index.module.less";
import AddParagraph from "@/components/Editor/components/AddParagraph";
import { useMemoizedFn } from "ahooks";
import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop";
type IWhiteboardProps = IExtensionBaseProps<WhiteboardElement>;

interface WhiteboardData {
  children: BoardElement[];
  viewPort: ViewPort;
  selection: Selection;
}

const Whiteboard: React.FC<React.PropsWithChildren<IWhiteboardProps>> = (
  props,
) => {
  const { attributes, children, element } = props;
  const editorReadOnly = useReadOnly();
  const editor = useSlate();
  const resizeStartYRef = useRef(0);
  const startHeightRef = useRef(0);
  const whiteboardRef = useRef<HTMLDivElement>(null);

  const { drag, drop, isDragging, isBefore, isOverCurrent, canDrop, canDrag } =
    useDragAndDrop({
      element,
    });

  const [isFullscreen, setIsFullscreen] = useState(false);
  const noFullscreenWidthRef = useRef(0);

  const { data, height } = element;

  // 计算视口中心点
  const calculateViewportCenter = useMemoizedFn(
    (viewPort: ViewPort): { centerX: number; centerY: number } => {
      const { minX, minY, width, height } = viewPort;
      return {
        centerX: minX + width / 2,
        centerY: minY + height / 2,
      };
    },
  );

  // 根据中心点和容器尺寸创建新的视口
  const createViewportFromCenter = useMemoizedFn(
    (
      centerX: number,
      centerY: number,
      containerWidth: number,
      containerHeight: number,
      zoom: number,
    ): ViewPort => {
      const width = containerWidth / zoom;
      const height = containerHeight / zoom;
      return {
        minX: centerX - width / 2,
        minY: centerY - height / 2,
        width,
        height,
        zoom,
      };
    },
  );
  // 更新白板数据
  const updateWhiteboardData = useMemoizedFn((data: WhiteboardData) => {
    if (editorReadOnly) return;

    try {
      const path = ReactEditor.findPath(editor, element);
      Transforms.setNodes(editor, { data } as any, { at: path });
    } catch (error) {
      console.error("更新白板数据失败:", error);
    }
  });

  // 处理白板数据变化
  const handleWhiteboardChange = useMemoizedFn(
    (newWhiteboardData: WhiteboardData) => {
      if (editorReadOnly) return;
      updateWhiteboardData(newWhiteboardData);
    },
  );

  const toggleFullscreen = useMemoizedFn(() => {
    handleFullscreenChange(!isFullscreen);
  });

  const handleFullscreenChange = useMemoizedFn((isFullscreen: boolean) => {
    if (isFullscreen) {
      noFullscreenWidthRef.current = data.viewPort.width;
      // 计算当前视口中心
      const { centerX, centerY } = calculateViewportCenter(data.viewPort);
      // 获取新的视口大小
      const containerWidth = window.innerWidth * 0.9;
      const containerHeight = window.innerHeight * 0.9;
      // 创建新的视口
      const newViewport = createViewportFromCenter(
        centerX,
        centerY,
        containerWidth,
        containerHeight,
        data.viewPort.zoom,
      );
      // 更新白板数据
      updateWhiteboardData({
        children: data.children,
        viewPort: newViewport,
        selection: data.selection,
      });
    } else {
      // 获取当前的中心坐标
      const { centerX, centerY } = calculateViewportCenter(data.viewPort);
      // 创建新的视口
      const newViewport = createViewportFromCenter(
        centerX,
        centerY,
        noFullscreenWidthRef.current,
        height,
        data.viewPort.zoom,
      );
      // 更新白板数据
      updateWhiteboardData({
        children: data.children,
        viewPort: newViewport,
        selection: data.selection,
      });
    }
    setTimeout(() => {
      setIsFullscreen(isFullscreen);
    }, 20);
  });

  // 更新白板高度
  const updateWhiteboardHeight = useMemoizedFn((height: number) => {
    if (editorReadOnly) return;

    try {
      const path = ReactEditor.findPath(editor, element);
      Transforms.setNodes(editor, { height }, { at: path });
    } catch (error) {
      console.error("更新白板高度失败:", error);
    }
  });

  // 处理拖动开始
  const handleResizeStart = useMemoizedFn((e: React.MouseEvent) => {
    e.preventDefault();
    resizeStartYRef.current = e.clientY;
    startHeightRef.current = height;

    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
  });

  // 处理拖动移动
  const handleResizeMove = useMemoizedFn((e: MouseEvent) => {
    const deltaY = e.clientY - resizeStartYRef.current;
    const newHeight = Math.max(
      200,
      Math.min(800, startHeightRef.current + deltaY),
    );
    updateWhiteboardHeight(newHeight);
  });

  // 处理拖动结束
  const handleResizeEnd = useMemoizedFn(() => {
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
  });

  return (
    <div
      ref={drop}
      className={classnames(styles.container, {
        [styles.isDragging]: isDragging,
        [styles.isBefore]: isBefore,
        [styles.isOverCurrent]: isOverCurrent,
        [styles.canDrop]: canDrop,
        [styles.canDrag]: canDrag,
      })}
    >
      <div {...attributes}>
        <div className={styles.whiteboardContainer}>
          <If condition={!isFullscreen}>
            <div
              className={styles.whiteboardWrapper}
              style={{ height }}
              ref={whiteboardRef}
            >
              <WhiteBoard
                initData={data.children}
                initViewPort={data.viewPort}
                initSelection={data.selection}
                style={{ width: "100%", height: "100%" }}
                readonly={editorReadOnly}
                onChange={handleWhiteboardChange}
              />
              <div
                className={styles.resizeHandle}
                onMouseDown={handleResizeStart}
              >
                <div className={styles.resizeIndicator} />
              </div>
            </div>

            <div className={styles.fullscreenButton} onClick={toggleFullscreen}>
              <MdFullscreen size={20} />
            </div>
          </If>
        </div>
        {children}
        {isFullscreen &&
          createPortal(
            <div
              className={styles.fullscreenOverlay}
              onClick={() => setIsFullscreen(false)}
            >
              <div
                className={styles.fullscreenContent}
                onClick={(e) => e.stopPropagation()}
              >
                <WhiteBoard
                  initData={data.children}
                  initViewPort={data.viewPort}
                  initSelection={data.selection}
                  style={{ width: "100%", height: "100%" }}
                  readonly={editorReadOnly}
                  onChange={handleWhiteboardChange}
                />
                <div className={styles.closeButton} onClick={toggleFullscreen}>
                  <MdFullscreenExit size={20} />
                </div>
              </div>
            </div>,
            document.body,
          )}
        <AddParagraph element={element} />
        <div
          contentEditable={false}
          ref={drag}
          className={classnames(styles.dragHandler, {
            [styles.canDrag]: canDrag,
          })}
        >
          <MdDragIndicator className={styles.icon} />
        </div>
      </div>
    </div>
  );
};

export default Whiteboard;
