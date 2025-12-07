import React, { useState, useRef, useEffect, memo } from "react";
import { useReadOnly } from "slate-react";
import {
  MdDragIndicator,
  MdFullscreen,
  MdFullscreenExit,
} from "react-icons/md";
import { createPortal } from "react-dom";
import { ReactEditor, useSlateStatic } from "slate-react";
import { Transforms } from "slate";
import classnames from "classnames";

import { WhiteboardElement } from "../../../../types/element/whiteboard";
import { IExtensionBaseProps } from "../../../types";
import { WhiteboardViewPort } from "../../../../types/services";

import { If } from "@tau/shared";

export interface BoardElement {
  id: string;
  type: string;
}
export interface Selection {
  selectedIds: string[];
}
export interface PresentationSequence {
  id: string;
  order: number;
}

import styles from "./index.module.less";
import AddParagraph from "../../../../components/AddParagraph";
import { useMemoizedFn } from "ahooks";
import useDragAndDrop from "../../../../hooks/useDragAndDrop";
import { WhiteBoardContent } from "../../../types";
import { LoadingOutlined } from "@ant-design/icons";
import { Empty } from "antd";
import useIsLastElement from "../../../../hooks/useIsLastElement";
type IWhiteboardProps = IExtensionBaseProps<WhiteboardElement>;

interface WhiteboardData {
  children: BoardElement[];
  viewPort: WhiteboardViewPort;
  selection: Selection;
  presentationSequences?: PresentationSequence[];
}

const Whiteboard: React.FC<React.PropsWithChildren<IWhiteboardProps>> = memo(
  (props) => {
    const { attributes, children, element } = props;
    const readOnly = useReadOnly();
    const editor = useSlateStatic();
    const resizeStartYRef = useRef(0);
    const startHeightRef = useRef(0);
    const whiteboardRef = useRef<HTMLDivElement>(null);
    const isLast = useIsLastElement(element);
    const WhiteBoard = editor.services?.components?.WhiteBoard;
    const whiteboardService = editor.services?.whiteboard;
    const {
      drag,
      drop,
      isDragging,
      isBefore,
      isOverCurrent,
      canDrop,
      canDrag,
    } = useDragAndDrop({
      element,
    });

    const [isFullscreen, setIsFullscreen] = useState(false);
    const [loading, setLoading] = useState(false);
    const noFullscreenWidthRef = useRef(0);
    const { whiteBoardContentId, height } = element;

    const [whiteBoardContent, setWhiteBoardContent] =
      useState<WhiteBoardContent | null>(null);
    const whiteBoardData = whiteBoardContent?.content ?? whiteBoardContent?.data ?? null;


    useEffect(() => {
      if (!whiteboardService) return;
      let disposed = false;

      const fetchWhiteboardContent = async () => {
        setLoading(true);
        try {
          const targetId = Number(whiteBoardContentId);
          if (Number.isNaN(targetId)) {
            setWhiteBoardContent(null);
            return;
          }

          let content: WhiteBoardContent | null = null;
          if (whiteboardService.getById) {
            content = await whiteboardService.getById(targetId);
          } else {
            const boards = await whiteboardService.getAll();
            content =
              boards.find((b) => b.id === targetId) || null;
          }

          if (disposed) return;

          if (content) {
            setWhiteBoardContent({
              ...content,
              content: content.content ?? content.data,
              data: content.data ?? content.content,
            });
          } else {
            setWhiteBoardContent(null);
          }
        } catch (error) {
          console.error("获取白板内容失败:", error);
          if (!disposed) {
            setWhiteBoardContent(null);
          }
        } finally {
          if (!disposed) {
            setLoading(false);
          }
        }
      };

      fetchWhiteboardContent();

      return () => {
        disposed = true;
      };
    }, [whiteBoardContentId, whiteboardService]);

    // 计算视口中心点
    const calculateViewportCenter = useMemoizedFn(
      (viewPort: WhiteboardViewPort): { centerX: number; centerY: number } => {
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
      ): WhiteboardViewPort => {
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
    const updateWhiteboardData = useMemoizedFn(async (data: WhiteboardData) => {
      if (readOnly || !whiteBoardContent || !editor.services?.whiteboard) return;

      await editor.services.whiteboard.update(whiteBoardContent.id, data);
      setWhiteBoardContent({
        ...whiteBoardContent,
        content: data,
        data: data,
      });
    });

    // 处理白板数据变化
    const handleWhiteboardChange = useMemoizedFn(
      (newWhiteboardData: WhiteboardData) => {
        if (readOnly) return;
        updateWhiteboardData(newWhiteboardData);
      },
    );

    const toggleFullscreen = useMemoizedFn(() => {
      handleFullscreenChange(!isFullscreen);
    });

    const handleFullscreenChange = useMemoizedFn(
      async (isFullscreen: boolean) => {
        if (!whiteBoardContent || !whiteBoardData) return;
        const data = whiteBoardData;
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
          await updateWhiteboardData({
            children: data.children as BoardElement[],
            viewPort: newViewport,
            selection: data.selection,
            presentationSequences: (data.presentationSequences || []) as PresentationSequence[],
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
          await updateWhiteboardData({
            children: data.children as BoardElement[],
            viewPort: newViewport,
            selection: data.selection,
            presentationSequences: (data.presentationSequences || []) as PresentationSequence[],
          });
        }
        setTimeout(() => {
          setIsFullscreen(isFullscreen);
        }, 20);
      },
    );

    // 更新白板高度
    const updateWhiteboardHeight = useMemoizedFn((height: number) => {
      if (readOnly) return;

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

    if (!WhiteBoard) {
      return (
        <div {...attributes}>
          {children}
          <div className={styles.empty}>白板组件未注入</div>
        </div>
      );
    }

    if (loading) {
      return (
        <div className={styles.loading} style={{ height }}>
          <LoadingOutlined />
        </div>
      );
    }

    if (!whiteBoardContent || !whiteBoardData) {
      return (
        <div
          className={styles.empty}
          style={{ height }}
          contentEditable={false}
        >
          <Empty description="白板不存在或者被删除" />
        </div>
      );
    }

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
        <div {...attributes} contentEditable={false}>
          <div className={styles.whiteboardContainer}>
            <If condition={!isFullscreen}>
              <div
                className={styles.whiteboardWrapper}
                style={{ height }}
                ref={whiteboardRef}
                contentEditable={false}
              >
                {WhiteBoard && (
                  <WhiteBoard
                    initData={(whiteBoardData.children as any[]) || []}
                    initViewPort={whiteBoardData.viewPort}
                    initSelection={whiteBoardData.selection}
                    style={{ width: "100%", height: "100%" }}
                    readOnly={readOnly}
                    onChange={handleWhiteboardChange}
                  />
                )}
                <div
                  className={styles.resizeHandle}
                  onMouseDown={handleResizeStart}
                >
                  <div className={styles.resizeIndicator} />
                </div>
              </div>

              <div
                className={styles.fullscreenButton}
                onClick={toggleFullscreen}
              >
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
                  {WhiteBoard && (
                    <WhiteBoard
                      initData={(whiteBoardData.children as any[]) || []}
                      initViewPort={whiteBoardData.viewPort}
                      initSelection={whiteBoardData.selection}
                      style={{ width: "100%", height: "100%" }}
                      readOnly={readOnly}
                      onChange={handleWhiteboardChange}
                    />
                  )}
                  <div
                    className={styles.closeButton}
                    onClick={toggleFullscreen}
                  >
                    <MdFullscreenExit size={20} />
                  </div>
                </div>
              </div>,
              document.body,
            )}
          {!(readOnly && isLast) && <AddParagraph element={element} />}
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
  },
);

export default Whiteboard;
