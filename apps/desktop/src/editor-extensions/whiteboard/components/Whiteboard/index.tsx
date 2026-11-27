import React, { useState, useRef, useEffect, memo } from "react";
import { useReadOnly } from "slate-react";
import { MdFullscreen, MdFullscreenExit } from "react-icons/md";
import { createPortal } from "react-dom";
import { ReactEditor, useSlateStatic } from "slate-react";
import { Transforms } from "slate";
import { AddParagraph, type ElementRenderProps } from "@tau/editor/api";

import { If } from "@tau/shared";
import DesktopWhiteboard from "@/features/shared/whiteboard/DesktopWhiteboard";
import { ViewPort, getDocumentVersion } from "@tau/whiteboard";
import { getWhiteboardContentById, updateSubWhiteboard } from "@/commands";
import { WhiteboardContent } from "@/types";

import { useMemoizedFn } from "ahooks";
import { Loader2 } from "lucide-react";
import { useIsLastElement } from "@tau/editor/api";
import { whiteboardEmbedPageId } from "@/entity/whiteboard-refs";
import type { WhiteboardElement } from "../../types";
import { useWhiteboardEmbedI18n } from "../../i18n";

type IWhiteboardProps = ElementRenderProps<WhiteboardElement>;

/** 右上角全屏 / 退出全屏按钮 */
const FLOATING_BUTTON_CLASS =
  "absolute right-[0.625em] top-[0.625em] z-10 flex cursor-pointer items-center justify-center rounded-[0.25em] bg-[rgba(38,38,38,0.6)] p-[0.25em] text-white transition-all duration-200";

type WhiteboardData = WhiteboardContent["data"];

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
  const { height } = element;
  const embeddedPageId = whiteboardEmbedPageId(element) as number | undefined;
  const whiteboardContentId = element.entityRef ?? embeddedPageId;

  const [whiteboardContent, setWhiteboardContent] = useState<WhiteboardContent | null>(null);
  const whiteboardData = whiteboardContent?.data ?? null;

  useEffect(() => {
    let disposed = false;

    const fetchWhiteboardContent = async () => {
      setLoading(true);
      try {
        if (whiteboardContentId === undefined) {
          setWhiteboardContent(null);
          return;
        }

        const content = await getWhiteboardContentById(whiteboardContentId);
        if (disposed) return;

        if (content) {
          setWhiteboardContent(content);
        } else {
          setWhiteboardContent(null);
        }
      } catch (error) {
        console.error("获取白板内容失败:", error);
        if (!disposed) {
          setWhiteboardContent(null);
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
  }, [embeddedPageId, element.entityRef?.sourceId, element.entityRef?.entityId]);

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
  const updateWhiteboardData = useMemoizedFn(async (data: WhiteboardData) => {
    if (readOnly || !whiteboardContent) return;
    const updatedContent = await updateSubWhiteboard(
      element.entityRef ?? whiteboardContent.id,
      whiteboardContent.name,
      data
    );
    setWhiteboardContent(updatedContent);
  });

  const handleWhiteboardChange = useMemoizedFn((newWhiteboardData: WhiteboardData) => {
    if (readOnly) return;
    updateWhiteboardData(newWhiteboardData);
  });

  const toggleFullscreen = useMemoizedFn(() => {
    handleFullscreenChange(!isFullscreen);
  });

  const handleFullscreenChange = useMemoizedFn(async (isFullscreen: boolean) => {
    if (!whiteboardContent || !whiteboardData) return;
    const data = whiteboardData;
    if (isFullscreen) {
      noFullscreenWidthRef.current = data.viewPort.width;
      const { centerX, centerY } = calculateViewportCenter(data.viewPort);
      const containerWidth = window.innerWidth * 0.9;
      const containerHeight = window.innerHeight * 0.9;
      const newViewport = createViewportFromCenter(
        centerX,
        centerY,
        containerWidth,
        containerHeight,
        data.viewPort.zoom
      );
      await updateWhiteboardData({ ...data, viewPort: newViewport });
    } else {
      const { centerX, centerY } = calculateViewportCenter(data.viewPort);
      const newViewport = createViewportFromCenter(
        centerX,
        centerY,
        noFullscreenWidthRef.current,
        height,
        data.viewPort.zoom
      );
      await updateWhiteboardData({ ...data, viewPort: newViewport });
    }
    setTimeout(() => {
      setIsFullscreen(isFullscreen);
    }, 20);
  });

  const updateWhiteboardHeight = useMemoizedFn((height: number) => {
    if (readOnly) return;

    try {
      const path = ReactEditor.findPath(editor, element);
      Transforms.setNodes(editor, { height }, { at: path });
    } catch (error) {
      console.error("更新白板高度失败:", error);
    }
  });

  const handleResizeStart = useMemoizedFn((e: React.MouseEvent) => {
    e.preventDefault();
    resizeStartYRef.current = e.clientY;
    startHeightRef.current = height;

    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
  });

  const handleResizeMove = useMemoizedFn((e: MouseEvent) => {
    const deltaY = e.clientY - resizeStartYRef.current;
    const newHeight = Math.max(200, Math.min(800, startHeightRef.current + deltaY));
    updateWhiteboardHeight(newHeight);
  });

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

  if (!whiteboardContent || !whiteboardData) {
    return (
      <div
        className="flex w-full items-center justify-center"
        style={{ height }}
        contentEditable={false}
      >
        <p className="text-ink-3 text-sm">
          <MissingWhiteboard />
        </p>
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
              <DesktopWhiteboard
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
            <FullscreenControl fullscreen={false} onToggle={toggleFullscreen} />
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
                <DesktopWhiteboard
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
                <FullscreenControl fullscreen onToggle={toggleFullscreen} />
              </div>
            </div>,
            document.body
          )}
        {!(readOnly && isLast) && <AddParagraph element={element} />}
      </div>
    </div>
  );
});

function MissingWhiteboard() {
  const { t } = useWhiteboardEmbedI18n();
  return t("missing");
}

function FullscreenControl({
  fullscreen,
  onToggle,
}: {
  fullscreen: boolean;
  onToggle: () => void;
}) {
  const { t } = useWhiteboardEmbedI18n();
  return (
    <div
      className={FLOATING_BUTTON_CLASS}
      onClick={onToggle}
      title={t(fullscreen ? "fullscreen.exit" : "fullscreen.enter")}
    >
      {fullscreen ? <MdFullscreenExit size={20} /> : <MdFullscreen size={20} />}
    </div>
  );
}

export default Whiteboard;
