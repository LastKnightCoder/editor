import { useState, useEffect } from "react";
import classNames from "classnames";
import { Tooltip, message } from "antd";
import { useZoom } from "@embedpdf/plugin-zoom/react";
import { ZoomMode } from "@embedpdf/plugin-zoom";
import { usePan } from "@embedpdf/plugin-pan/react";
import { useScroll } from "@embedpdf/plugin-scroll/react";
import { useRotate } from "@embedpdf/plugin-rotate/react";
import { useSpread } from "@embedpdf/plugin-spread/react";
import { SpreadMode } from "@embedpdf/plugin-spread";
import { useCaptureCapability } from "@embedpdf/plugin-capture/react";
import { useAnnotationCapability } from "@embedpdf/plugin-annotation/react";
import type { IconType } from "react-icons";
import {
  LuBookmarkPlus,
  LuCamera,
  LuChevronLeft,
  LuChevronRight,
  LuColumns,
  LuDownload,
  LuExpand,
  LuHand,
  LuHighlighter,
  LuMaximize2,
  LuMousePointer2,
  LuRotateCcw,
  LuRotateCw,
  LuSearch,
  LuSquare,
  LuStrikethrough,
  LuTrash2,
  LuUnderline,
  LuWaves,
  LuZoomIn,
  LuZoomOut,
  LuPrinter,
} from "react-icons/lu";
interface PdfEmbedToolbarProps {
  onAddBookmark?: () => void;
}

type ToolbarIconButtonProps = {
  icon: IconType;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
};

const ToolbarIconButton = ({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
}: ToolbarIconButtonProps) => (
  <Tooltip title={label}>
    <button
      type="button"
      className={classNames("pdf-toolbar-icon", { active })}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon size={16} strokeWidth={1.7} />
    </button>
  </Tooltip>
);

const PdfEmbedToolbar = ({ onAddBookmark }: PdfEmbedToolbarProps) => {
  const { provides: zoom, state: zoomState } = useZoom();
  const { provides: pan, isPanning } = usePan();
  const {
    state: scrollState,
    scrollToNextPage,
    scrollToPreviousPage,
  } = useScroll();
  const { provides: rotate } = useRotate();
  const { spreadMode, provides: spread } = useSpread();
  const { provides: capture } = useCaptureCapability();
  const { provides: annotation } = useAnnotationCapability();

  const [annotationSelected, setAnnotationSelected] = useState(false);
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const [captureActive, setCaptureActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    Boolean(typeof document !== "undefined" && document.fullscreenElement),
  );

  useEffect(() => {
    if (!annotation) return;
    setActiveToolId(annotation.getActiveTool()?.id ?? null);
    setAnnotationSelected(Boolean(annotation.getSelectedAnnotation()));
    const unsubscribeState = annotation.onStateChange((state) => {
      setAnnotationSelected(Boolean(state.selectedUid));
    });
    const unsubscribeTool = annotation.onActiveToolChange((tool) => {
      setActiveToolId(tool?.id ?? null);
    });
    return () => {
      unsubscribeState?.();
      unsubscribeTool?.();
    };
  }, [annotation]);

  useEffect(() => {
    if (!capture) return;
    setCaptureActive(capture.isMarqueeCaptureActive());
    return capture.onMarqueeCaptureActiveChange((active) => {
      setCaptureActive(active);
    });
  }, [capture]);

  useEffect(() => {
    const handler = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
    };
  }, []);

  const zoomPercent = zoomState
    ? Math.round(zoomState.currentZoomLevel * 100)
    : 100;
  const currentPage = scrollState?.currentPage ?? 1;
  const totalPages = scrollState?.totalPages ?? 1;

  const handleDeleteAnnotation = () => {
    const selected = annotation?.getSelectedAnnotation();
    if (selected) {
      annotation?.deleteAnnotation(
        selected.object.pageIndex,
        selected.object.id,
      );
    }
  };

  const handleSetTool = (toolId: string | null) => {
    annotation?.setActiveTool(toolId);
  };

  const handleSpreadMode = (mode: SpreadMode) => {
    spread?.setSpreadMode(mode);
  };

  const handleRotation = (direction: "forward" | "backward") => {
    if (!rotate) return;
    if (direction === "forward") {
      rotate.rotateForward();
    } else {
      rotate.rotateBackward();
    }
  };

  const handleFitWidth = () => {
    zoom?.requestZoom(ZoomMode.FitWidth);
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  const handlePlaceholder = (title: string) => {
    message.info(`${title} 功能即将上线`);
  };

  return (
    <div className="pdf-embed-toolbar">
      <div className="pdf-toolbar-group">
        <ToolbarIconButton
          icon={LuChevronLeft}
          label="上一页"
          onClick={() => scrollToPreviousPage?.("smooth")}
          disabled={!scrollToPreviousPage}
        />
        <div className="pdf-toolbar-page">
          <span>{currentPage}</span>
          <span className="divider">/</span>
          <span>{totalPages}</span>
        </div>
        <ToolbarIconButton
          icon={LuChevronRight}
          label="下一页"
          onClick={() => scrollToNextPage?.("smooth")}
          disabled={!scrollToNextPage}
        />
      </div>

      <div className="pdf-toolbar-group">
        <ToolbarIconButton
          icon={LuZoomOut}
          label="缩小"
          onClick={() => zoom?.zoomOut()}
          disabled={!zoom}
        />
        <ToolbarIconButton
          icon={LuZoomIn}
          label="放大"
          onClick={() => zoom?.zoomIn()}
          disabled={!zoom}
        />
        <span className="pdf-toolbar-zoom">{zoomPercent}%</span>
        <ToolbarIconButton
          icon={LuExpand}
          label={`适配宽度 (${zoomPercent}%)`}
          onClick={handleFitWidth}
          disabled={!zoom}
        />
        <ToolbarIconButton
          icon={LuSquare}
          label="单页模式"
          onClick={() => handleSpreadMode(SpreadMode.None)}
          active={spreadMode === SpreadMode.None}
        />
        <ToolbarIconButton
          icon={LuColumns}
          label="双页模式"
          onClick={() => handleSpreadMode(SpreadMode.Odd)}
          active={spreadMode === SpreadMode.Odd}
        />
        <ToolbarIconButton
          icon={LuRotateCcw}
          label="向左旋转"
          onClick={() => handleRotation("backward")}
          disabled={!rotate}
        />
        <ToolbarIconButton
          icon={LuRotateCw}
          label="向右旋转"
          onClick={() => handleRotation("forward")}
          disabled={!rotate}
        />
        <ToolbarIconButton
          icon={LuCamera}
          label="区域截图"
          onClick={() => capture?.toggleMarqueeCapture()}
          active={captureActive}
          disabled={!capture}
        />
        <ToolbarIconButton
          icon={LuMaximize2}
          label={isFullscreen ? "退出全屏" : "全屏"}
          onClick={handleToggleFullscreen}
          active={isFullscreen}
        />
      </div>

      <div className="pdf-toolbar-group">
        <ToolbarIconButton
          icon={LuMousePointer2}
          label="指针"
          onClick={() => handleSetTool(null)}
          active={!activeToolId}
        />
        <ToolbarIconButton
          icon={LuHand}
          label="拖拽"
          onClick={() => pan?.togglePan()}
          active={isPanning}
        />
        <ToolbarIconButton
          icon={LuHighlighter}
          label="高亮"
          onClick={() => handleSetTool("highlight")}
          active={activeToolId === "highlight"}
        />
        <ToolbarIconButton
          icon={LuUnderline}
          label="下划线"
          onClick={() => handleSetTool("underline")}
          active={activeToolId === "underline"}
        />
        <ToolbarIconButton
          icon={LuWaves}
          label="波浪线"
          onClick={() => handleSetTool("squiggly")}
          active={activeToolId === "squiggly"}
        />
        <ToolbarIconButton
          icon={LuStrikethrough}
          label="删除线"
          onClick={() => handleSetTool("strikeout")}
          active={activeToolId === "strikeout"}
        />
        <ToolbarIconButton
          icon={LuBookmarkPlus}
          label="添加书签"
          onClick={onAddBookmark}
          disabled={!onAddBookmark}
        />
        <ToolbarIconButton
          icon={LuTrash2}
          label="删除标注"
          onClick={handleDeleteAnnotation}
          disabled={!annotation || !annotationSelected}
        />
      </div>

      <div className="pdf-toolbar-group pdf-toolbar-group-right">
        <ToolbarIconButton
          icon={LuSearch}
          label="搜索"
          onClick={() => handlePlaceholder("搜索")}
        />
        <ToolbarIconButton
          icon={LuDownload}
          label="导出"
          onClick={() => handlePlaceholder("导出")}
        />
        <ToolbarIconButton
          icon={LuPrinter}
          label="打印"
          onClick={() => handlePlaceholder("打印")}
        />
      </div>
    </div>
  );
};

export default PdfEmbedToolbar;
