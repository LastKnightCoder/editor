import React, { useState, useRef, useEffect, memo } from "react";
import { useReadOnly } from "slate-react";
import { MdFullscreen, MdFullscreenExit } from "react-icons/md";
import { createPortal } from "react-dom";
import { ReactEditor, useSlateStatic } from "slate-react";
import { Transforms } from "slate";
import { AddParagraph, type ElementRenderProps } from "@tau/editor/api";

import { If } from "@tau/shared";
import WhiteBoard from "@/features/shared/whiteboard/DesktopWhiteboard";
import { ViewPort, getDocumentVersion } from "@tau/whiteboard";
import { getWhiteBoardContentById, updateSubWhiteBoard } from "@/commands";
import { WhiteBoardContent } from "@/types";

import { useMemoizedFn } from "ahooks";
import { Loader2 } from "lucide-react";
import { useIsLastElement } from "@tau/editor/api";
import type { WhiteboardElement } from "../../types";
type IWhiteboardProps = ElementRenderProps<WhiteboardElement>;

/** 右上角全屏 / 退出全屏按钮 */
const FLOATING_BUTTON_CLASS =
  "absolute right-[0.625em] top-[0.625em] z-10 flex cursor-pointer items-center justify-center rounded-[0.25em] bg-[rgba(38,38,38,0.6)] p-[0.25em] text-white transition-all duration-200";

type WhiteboardData = WhiteBoardContent["data"];

const Whiteboard: React.FC<React.PropsWithChildren<IWhiteboardProps>> = memo(props => {
  const { attributes, children, element } = props;
  const readOnly = useReadOnly();
  const editor = useSlateStatic();
  const resizeStartYRef = useRef(0);
  const startHeightRef = useRef(0);
  const whiteboardRef = useRef<HTMLDivElement>(null);
  const isLast = useIsLastElement(element);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(false);
  const noFullscreenWidthRef = useRef(0);
  const { whiteBoardContentId, height } = element;

  const [whiteBoardContent, setWhiteBoardContent] = useState<WhiteBoardContent | null>(null);
  const whiteboardData = whiteBoardContent?.data ?? null;

  useEffect(() => {
    let disposed = false;

    const fetchWhiteboardContent = async () => {
      setLoading(true);
      try {
        const targetId = Number(whiteBoardContentId);
        if (Number.isNaN(targetId)) {
          setWhiteBoardContent(null);
          return;
        }

        const content = await getWhiteBoardContentById(targetId);
        if (disposed) return;

        if (content) {
          setWhiteBoardContent(content);
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
  }, [whiteBoardContentId]);

  // 计算视口中心点
  const calculateViewportCenter = useMemoizedFn(
    (viewPort: ViewPort): { centerX: number; centerY: number } => {
      const { minX, minY, width, height } = viewPort;
      return {
        centerX: minX + width / 2,
        centerY: minY + height / 2,
      };
    }
  );

  // 根据中心点和容器尺寸创建新的视口
  const createViewportFromCenter = useMemoizedFn(
    (
      centerX: number,
      centerY: number,
      containerWidth: number,
      containerHeight: number,
      zoom: number
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
    }
  );
  // 更新白板数据
  const updateWhiteboardData = useMemoizedFn(async (data: WhiteboardData) => {
    if (readOnly || !whiteBoardContent) return;
    const updatedContent = await updateSubWhiteBoard(
      whiteBoardContent.id,
      whiteBoardContent.name,
      data
    );
    setWhiteBoardContent(updatedContent);
  });

  // 处理白板数据变化
  const handleWhiteboardChange = useMemoizedFn((newWhiteboardData: WhiteboardData) => {
    if (readOnly) return;
    updateWhiteboardData(newWhiteboardData);
  });

  const toggleFullscreen = useMemoizedFn(() => {
    handleFullscreenChange(!isFullscreen);
  });

  const handleFullscreenChange = useMemoizedFn(async (isFullscreen: boolean) => {
    if (!whiteBoardContent || !whiteboardData) return;
    const data = whiteboardData;
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
        data.viewPort.zoom
      );
      // 更新白板数据
      await updateWhiteboardData({ ...data, viewPort: newViewport });
    } else {
      // 获取当前的中心坐标
      const { centerX, centerY } = calculateViewportCenter(data.viewPort);
      // 创建新的视口
      const newViewport = createViewportFromCenter(
        centerX,
        centerY,
        noFullscreenWidthRef.current,
        height,
        data.viewPort.zoom
      );
      // 更新白板数据
      await updateWhiteboardData({ ...data, viewPort: newViewport });
    }
    setTimeout(() => {
      setIsFullscreen(isFullscreen);
    }, 20);
  });

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
    const newHeight = Math.max(200, Math.min(800, startHeightRef.current + deltaY));
    updateWhiteboardHeight(newHeight);
  });

  // 处理拖动结束
  const handleResizeEnd = useMemoizedFn(() => {
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
  });

  if (loading) {
    return (
      <div className="flex w-full items-center justify-center" style={{ height }}>
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!whiteBoardContent || !whiteboardData) {
    return (
      <div
        className="flex w-full items-center justify-center"
        style={{ height }}
        contentEditable={false}
      >
        <p className="text-ink-3 text-sm">白板不存在或者被删除</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div {...attributes} contentEditable={false}>
        <div className="border-line-1 relative my-[0.625em] w-full overflow-hidden rounded-[0.5em] border border-solid">
          <If condition={!isFullscreen}>
            <div
              className="relative h-[400px] w-full overflow-hidden"
              style={{ height }}
              ref={whiteboardRef}
              contentEditable={false}
            >
              <WhiteBoard
                showSidebar={false}
                initData={whiteboardData.children || []}
                initViewPort={whiteboardData.viewPort}
                initSelection={whiteboardData.selection}
                initPresentationSequences={whiteboardData.presentationSequences || []}
                initSketch={whiteboardData.sketch}
                version={getDocumentVersion(whiteboardData)}
                style={{ width: "100%", height: "100%" }}
                readonly={readOnly}
                onChange={handleWhiteboardChange}
              />
              <div
                className="absolute bottom-0 left-0 z-10 flex h-[10px] w-full cursor-row-resize items-center justify-center"
                onMouseDown={handleResizeStart}
              >
                <div className="bg-line-1 h-[0.25em] w-[2em] rounded-[1em]" />
              </div>
            </div>

            {/* 压在画布上的固定深色按钮，不随主题 */}
            <div className={FLOATING_BUTTON_CLASS} onClick={toggleFullscreen}>
              <MdFullscreen size={20} />
            </div>
          </If>
        </div>
        {children}
        {isFullscreen &&
          createPortal(
            <div
              className="fixed inset-0 z-[1000] flex items-center justify-center bg-[rgba(0,0,0,0.5)]"
              onClick={() => setIsFullscreen(false)}
            >
              <div
                className="bg-page relative h-[90%] w-[90%] rounded-[0.5em]"
                onClick={e => e.stopPropagation()}
              >
                <WhiteBoard
                  showSidebar={false}
                  initData={whiteboardData.children || []}
                  initViewPort={whiteboardData.viewPort}
                  initSelection={whiteboardData.selection}
                  initPresentationSequences={whiteboardData.presentationSequences || []}
                  initSketch={whiteboardData.sketch}
                  version={getDocumentVersion(whiteboardData)}
                  style={{ width: "100%", height: "100%" }}
                  readonly={readOnly}
                  onChange={handleWhiteboardChange}
                />
                <div className={FLOATING_BUTTON_CLASS} onClick={toggleFullscreen}>
                  <MdFullscreenExit size={20} />
                </div>
              </div>
            </div>,
            document.body
          )}
        {!(readOnly && isLast) && <AddParagraph element={element} />}
      </div>
    </div>
  );
});

export default Whiteboard;
