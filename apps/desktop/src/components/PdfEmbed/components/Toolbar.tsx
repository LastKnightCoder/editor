import { useState, useEffect, useRef, useMemo, type ReactElement } from "react";
import classNames from "classnames";
import { Tooltip } from "antd";
import { useZoom } from "@embedpdf/plugin-zoom/react";
import { ZoomMode } from "@embedpdf/plugin-zoom";
import { usePanCapability } from "@embedpdf/plugin-pan/react";
import { useScroll } from "@embedpdf/plugin-scroll/react";
import { useRotate } from "@embedpdf/plugin-rotate/react";
import { useSpread } from "@embedpdf/plugin-spread/react";
import { SpreadMode } from "@embedpdf/plugin-spread";
import { useCaptureCapability } from "@embedpdf/plugin-capture/react";
import { useAnnotationCapability } from "@embedpdf/plugin-annotation/react";
import { useInteractionManagerCapability } from "@embedpdf/plugin-interaction-manager/react";
import type { IconType } from "react-icons";
import useThemeColors from "@/hooks/useThemeColors";
import useTheme from "@/hooks/useTheme";
import {
  LuBookmarkPlus,
  LuBot,
  LuCamera,
  LuChevronLeft,
  LuChevronRight,
  LuColumns,
  LuExpand,
  LuHand,
  LuHighlighter,
  LuMaximize2,
  LuMousePointer2,
  LuRotateCcw,
  LuRotateCw,
  LuSquare,
  LuStrikethrough,
  LuUnderline,
  LuWaves,
  LuZoomIn,
  LuZoomOut,
} from "react-icons/lu";
import { TOOLBAR_LAYOUTS, type ToolbarSectionKey } from "../toolbarConfig";

interface PdfEmbedToolbarProps {
  onAddBookmark?: () => void;
  canAskAI?: boolean;
  onAskAI?: () => void;
}

type ToolbarIconButtonProps = {
  icon: IconType;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
  themeColors: ReturnType<typeof useThemeColors>;
  isDark: boolean;
};

const ToolbarIconButton = ({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
  className,
  themeColors,
  isDark,
}: ToolbarIconButtonProps) => {
  // 根据 active 状态选择样式
  const buttonClass = active
    ? isDark
      ? themeColors.activeClass
      : "bg-gray-100 text-gray-900"
    : classNames(themeColors.textClass, themeColors.hoverClass);

  return (
    <Tooltip title={label}>
      <button
        type="button"
        className={classNames(
          "w-8 h-8 inline-flex items-center justify-center rounded-lg border-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
          !active && "bg-transparent",
          buttonClass,
          className,
        )}
        onClick={onClick}
        disabled={disabled}
      >
        <Icon size={16} />
      </button>
    </Tooltip>
  );
};

const PdfEmbedToolbar = ({
  onAddBookmark,
  canAskAI,
  onAskAI,
}: PdfEmbedToolbarProps) => {
  const themeColors = useThemeColors();
  const { isDark } = useTheme();
  const { provides: zoom, state: zoomState } = useZoom();
  const { provides: pan } = usePanCapability();
  const { provides: interactionManager } = useInteractionManagerCapability();
  const scrollHook = useScroll();
  const { state: scrollState } = scrollHook;
  const scrollCapability = scrollHook.provides;
  const { provides: rotate } = useRotate();
  const { spreadMode, provides: spread } = useSpread();
  const { provides: capture } = useCaptureCapability();
  const { provides: annotation } = useAnnotationCapability();
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  const [isPanning, setIsPanning] = useState(false);
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const [captureActive, setCaptureActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    Boolean(typeof document !== "undefined" && document.fullscreenElement),
  );
  const [layoutRows, setLayoutRows] = useState<ToolbarSectionKey[][]>(() =>
    TOOLBAR_LAYOUTS[TOOLBAR_LAYOUTS.length - 1].rows.map((row) => [...row]),
  );

  useEffect(() => {
    if (!annotation) return;
    setActiveToolId(annotation.getActiveTool()?.id ?? null);
    const unsubscribeTool = annotation.onActiveToolChange((tool) => {
      setActiveToolId(tool?.id ?? null);
    });
    return () => {
      unsubscribeTool?.();
    };
  }, [annotation]);

  useEffect(() => {
    if (!interactionManager) return;
    const syncPanState = () => {
      setIsPanning(interactionManager.getActiveMode?.() === "panMode");
    };
    syncPanState();
    const unsubscribe = interactionManager.onModeChange?.((state) => {
      setIsPanning(state.activeMode === "panMode");
    });
    return () => {
      unsubscribe?.();
    };
  }, [interactionManager]);

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

  useEffect(() => {
    const element = toolbarRef.current;
    if (!element) return;

    const resolveRowsForWidth = (width: number) => {
      const layout =
        TOOLBAR_LAYOUTS.find((config) => width <= config.maxWidth) ??
        TOOLBAR_LAYOUTS[TOOLBAR_LAYOUTS.length - 1];
      setLayoutRows((prev) => {
        const isSame =
          prev.length === layout.rows.length &&
          prev.every(
            (row, rowIndex) =>
              row.length === layout.rows[rowIndex]?.length &&
              row.every(
                (section, sectionIndex) =>
                  section === layout.rows[rowIndex]?.[sectionIndex],
              ),
          );
        if (isSame) {
          return prev;
        }
        return layout.rows.map((row) => [...row]);
      });
    };

    const measure = () => {
      const width =
        element.clientWidth ||
        element.getBoundingClientRect().width ||
        (typeof window !== "undefined" ? window.innerWidth : 0) ||
        0;
      resolveRowsForWidth(width);
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      if (typeof window !== "undefined") {
        window.addEventListener("resize", measure);
        return () => {
          window.removeEventListener("resize", measure);
        };
      }
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      resolveRowsForWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const zoomPercent = zoomState
    ? Math.round(zoomState.currentZoomLevel * 100)
    : 100;
  const currentPage = scrollState?.currentPage ?? 1;
  const totalPages = scrollState?.totalPages ?? 1;

  const handleSetTool = (toolId: string | null) => {
    // 切换标注工具时，关闭拖拽模式
    if (isPanning) {
      pan?.disablePan();
    }
    annotation?.setActiveTool(toolId);
  };

  const handleTogglePan = () => {
    if (isPanning) {
      // 关闭拖拽模式
      pan?.disablePan();
    } else {
      // 开启拖拽模式时，清除标注工具
      annotation?.setActiveTool(null);
      pan?.enablePan();
    }
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

  const renderNavSection = () => (
    <div className="flex items-center gap-1.5">
      <ToolbarIconButton
        icon={LuChevronLeft}
        label="上一页"
        onClick={() => scrollCapability?.scrollToPreviousPage?.("smooth")}
        disabled={!scrollCapability?.scrollToPreviousPage}
        themeColors={themeColors}
        isDark={isDark}
      />
      <ToolbarIconButton
        icon={LuChevronRight}
        label="下一页"
        onClick={() => scrollCapability?.scrollToNextPage?.("smooth")}
        disabled={!scrollCapability?.scrollToNextPage}
        themeColors={themeColors}
        isDark={isDark}
      />
      <div
        className={classNames(
          "flex items-center gap-1 px-2 text-[13px]",
          themeColors.secondaryTextClass,
        )}
      >
        <span>{currentPage}</span>
        <span>/</span>
        <span>{totalPages}</span>
      </div>
    </div>
  );

  const renderViewSection = () => (
    <div className="flex items-center gap-1.5">
      <ToolbarIconButton
        icon={LuZoomOut}
        label="缩小"
        onClick={() => zoom?.zoomOut()}
        disabled={!zoom}
        themeColors={themeColors}
        isDark={isDark}
      />
      <ToolbarIconButton
        icon={LuZoomIn}
        label="放大"
        onClick={() => zoom?.zoomIn()}
        disabled={!zoom}
        themeColors={themeColors}
        isDark={isDark}
      />
      <span
        className={classNames(
          "text-xs min-w-[44px] text-center",
          themeColors.secondaryTextClass,
        )}
      >
        {zoomPercent}%
      </span>
      <ToolbarIconButton
        icon={LuExpand}
        label="适配宽度"
        onClick={handleFitWidth}
        disabled={!zoom}
        themeColors={themeColors}
        isDark={isDark}
      />
      <ToolbarIconButton
        icon={LuSquare}
        label="单页模式"
        onClick={() => handleSpreadMode(SpreadMode.None)}
        active={spreadMode === SpreadMode.None}
        themeColors={themeColors}
        isDark={isDark}
      />
      <ToolbarIconButton
        icon={LuColumns}
        label="双页模式"
        onClick={() => handleSpreadMode(SpreadMode.Odd)}
        active={spreadMode === SpreadMode.Odd}
        themeColors={themeColors}
        isDark={isDark}
      />
      <ToolbarIconButton
        icon={LuRotateCcw}
        label="向左旋转"
        onClick={() => handleRotation("backward")}
        disabled={!rotate}
        themeColors={themeColors}
        isDark={isDark}
      />
      <ToolbarIconButton
        icon={LuRotateCw}
        label="向右旋转"
        onClick={() => handleRotation("forward")}
        disabled={!rotate}
        themeColors={themeColors}
        isDark={isDark}
      />
      <ToolbarIconButton
        icon={LuCamera}
        label="区域截图"
        onClick={() => capture?.toggleMarqueeCapture()}
        active={captureActive}
        disabled={!capture}
        themeColors={themeColors}
        isDark={isDark}
      />
      <ToolbarIconButton
        icon={LuMaximize2}
        label={isFullscreen ? "退出全屏" : "全屏"}
        onClick={handleToggleFullscreen}
        active={isFullscreen}
        themeColors={themeColors}
        isDark={isDark}
      />
    </div>
  );

  const renderAnnotateSection = () => (
    <div className="flex items-center gap-1.5">
      <ToolbarIconButton
        icon={LuMousePointer2}
        label="指针"
        onClick={() => handleSetTool(null)}
        active={!activeToolId && !isPanning}
        themeColors={themeColors}
        isDark={isDark}
      />
      <ToolbarIconButton
        icon={LuHand}
        label="拖拽"
        onClick={handleTogglePan}
        active={isPanning}
        themeColors={themeColors}
        isDark={isDark}
      />
      <ToolbarIconButton
        icon={LuHighlighter}
        label="高亮"
        onClick={() => handleSetTool("highlight")}
        active={activeToolId === "highlight"}
        themeColors={themeColors}
        isDark={isDark}
      />
      <ToolbarIconButton
        icon={LuUnderline}
        label="下划线"
        onClick={() => handleSetTool("underline")}
        active={activeToolId === "underline"}
        themeColors={themeColors}
        isDark={isDark}
      />
      <ToolbarIconButton
        icon={LuWaves}
        label="波浪线"
        onClick={() => handleSetTool("squiggly")}
        active={activeToolId === "squiggly"}
        themeColors={themeColors}
        isDark={isDark}
      />
      <ToolbarIconButton
        icon={LuStrikethrough}
        label="删除线"
        onClick={() => handleSetTool("strikeout")}
        active={activeToolId === "strikeout"}
        themeColors={themeColors}
        isDark={isDark}
      />
      <ToolbarIconButton
        icon={LuBookmarkPlus}
        label="添加书签"
        onClick={onAddBookmark}
        disabled={!onAddBookmark}
        themeColors={themeColors}
        isDark={isDark}
      />
      <ToolbarIconButton
        icon={LuBot}
        label="AI 问答"
        onClick={onAskAI}
        disabled={!canAskAI || !onAskAI}
        themeColors={themeColors}
        isDark={isDark}
      />
    </div>
  );

  const sectionRenderers: Record<ToolbarSectionKey, () => ReactElement> = {
    nav: renderNavSection,
    view: renderViewSection,
    annotate: renderAnnotateSection,
  };

  const rows = useMemo(
    () => layoutRows.filter((row) => row.length),
    [layoutRows],
  );

  return (
    <div
      className={classNames(
        "flex flex-col gap-2 px-5 py-3 border-b",
        themeColors.borderClass,
      )}
      ref={toolbarRef}
    >
      {rows.map((sections, index) =>
        sections.length ? (
          <div key={index} className="flex items-center gap-4 flex-wrap">
            {sections.map((section) => (
              <div key={section} className="flex">
                {sectionRenderers[section]?.()}
              </div>
            ))}
          </div>
        ) : null,
      )}
    </div>
  );
};

export default PdfEmbedToolbar;
