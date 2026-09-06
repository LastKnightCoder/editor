import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Download } from "lucide-react";
import { App } from "antd";
import { useMemoizedFn } from "ahooks";
import useTheme from "@/hooks/useTheme";
import { captureBlobWithSnapdom } from "@/utils/snapdom-export";
import Board from "../../Board";
import BoardContent from "../BoardContent";
import type { BoardElement, ViewPort } from "../../types";
import SegmentedControl, { SegmentedOption } from "./components/SegmentedControl";
import NumberStepper from "./components/NumberStepper";
import {
  ExportImageAction,
  ExportImageBackgroundMode,
  calculateExportBounds,
  cloneSelection,
  createExportFilename,
  createExportViewPort,
  downloadBlobAsFile,
  resolveExportBackgroundColor,
  resolveExportElements,
} from "../../utils";
import { isInteriorConnectElement } from "../../utils/ConnectPointUtil";

interface ExportImageModalProps {
  open: boolean;
  onClose: () => void;
  board: Board;
  action?: string;
  selectedElementIds?: string[];
}

interface CaptureRenderState {
  elements: BoardElement[];
  viewPort: ViewPort;
  backgroundColor: string | null;
  centerConnectArrows: BoardElement[];
  noneCenterConnectArrows: BoardElement[];
  centerConnectAndSelectedArrows: BoardElement[];
}

const EMPTY_REF_LINES: Array<{
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}> = [];

const BACKGROUND_OPTIONS: SegmentedOption<ExportImageBackgroundMode>[] = [
  { value: "light", label: "白色" },
  { value: "dark", label: "深色" },
  { value: "transparent", label: "透明" },
];

const isCenterConnectArrow = isInteriorConnectElement;

const splitElementsForRender = (elements: BoardElement[], selectedIds: Set<string>) => {
  const centerConnectArrows: BoardElement[] = [];
  const noneCenterConnectArrows: BoardElement[] = [];
  const centerConnectAndSelectedArrows: BoardElement[] = [];

  for (const element of elements) {
    if (!isCenterConnectArrow(element)) {
      noneCenterConnectArrows.push(element);
      continue;
    }

    if (selectedIds.has(element.id)) {
      centerConnectAndSelectedArrows.push(element);
    } else {
      centerConnectArrows.push(element);
    }
  }

  return {
    centerConnectArrows,
    noneCenterConnectArrows,
    centerConnectAndSelectedArrows,
  };
};

const waitDoubleRaf = () =>
  new Promise<void>(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });

const markNodeIgnored = (element: Element) => {
  (element as HTMLElement).dataset.exportIgnore = "true";
};

/**
 * 等待异步媒体组件（LocalImage / LocalVideo / LocalAudio）完成 URL 解析并将标签渲染到 DOM
 *
 * 这些组件在异步解析 URL 期间返回 null，导致 DOM 中暂时不存在对应标签。
 * 通过轮询检测媒体标签的总数量是否稳定，来判断所有异步媒体组件是否已完成渲染。
 *
 * 这一步必须在 prepareCaptureNode 之前执行，否则：
 * - img 标签不存在 → 无法等待图片数据加载完成
 * - video / audio 标签不存在 → 无法标记为 exportIgnore，可能意外出现在导出图中
 */
const waitForMediaRender = async (captureTarget: Element, maxWaitMs = 15000): Promise<void> => {
  const POLL_INTERVAL = 200;
  const STABLE_THRESHOLD = 3;
  const startTime = Date.now();
  let previousCount = -1;
  let stableChecks = 0;

  const countMediaElements = () => captureTarget.querySelectorAll("img, video, audio").length;

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));

    const currentCount = countMediaElements();

    if (currentCount === previousCount) {
      stableChecks++;
      if (stableChecks >= STABLE_THRESHOLD) return;
    } else {
      stableChecks = 0;
      previousCount = currentCount;
    }
  }
};

const waitImageReady = async (image: HTMLImageElement): Promise<void> => {
  if (!image.src) {
    throw new Error("图片地址为空");
  }

  if (image.complete && image.naturalWidth > 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("图片加载超时"));
    }, 6000);

    const handleLoad = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    const handleError = () => {
      window.clearTimeout(timeout);
      reject(new Error("图片加载失败"));
    };

    image.addEventListener("load", handleLoad, { once: true });
    image.addEventListener("error", handleError, { once: true });
  });

  if (typeof image.decode === "function") {
    await image.decode();
  }
};

const prepareCaptureNode = async (captureTarget: Element) => {
  // 导出时移除 RichText 容器的 box-shadow，避免阴影影响导出效果
  captureTarget.querySelectorAll<HTMLElement>("[id^='rich-text-container-']").forEach(element => {
    element.style.boxShadow = "none";
  });

  // 将 contenteditable 元素设为不可编辑，避免导出时出现光标和编辑态样式
  captureTarget
    .querySelectorAll<HTMLElement>(
      "[contenteditable='true'], [contenteditable='plaintext-only'], [data-slate-editor], [data-slate-editor='true']"
    )
    .forEach(element => {
      element.blur?.();
      element.setAttribute("contenteditable", "false");
      element.style.caretColor = "transparent";
    });

  const unstableTags = ["video", "audio", "iframe", "webview", "object", "embed"];
  unstableTags.forEach(tagName => {
    captureTarget.querySelectorAll(tagName).forEach(element => {
      markNodeIgnored(element);
    });
  });

  const images = Array.from(captureTarget.querySelectorAll("img"));
  await Promise.all(
    images.map(async image => {
      image.setAttribute("loading", "eager");
      image.setAttribute("decoding", "sync");
      try {
        await waitImageReady(image);
      } catch (_error) {
        markNodeIgnored(image);
      }
    })
  );
};

const ExportImageModal = (props: ExportImageModalProps) => {
  const { open, onClose, board, action, selectedElementIds } = props;
  const { message } = App.useApp();
  const { isDark } = useTheme();
  const captureContainerRef = useRef<HTMLDivElement>(null);

  const [background, setBackground] = useState<ExportImageBackgroundMode>(
    isDark ? "dark" : "light"
  );
  const [scale, setScale] = useState<number>(window.devicePixelRatio || 1);
  const [padding, setPadding] = useState<number>(30);
  const [exporting, setExporting] = useState(false);
  const [captureState, setCaptureState] = useState<CaptureRenderState | null>(null);

  const exportAction: ExportImageAction = action === "selection" ? "selection" : "board";

  useEffect(() => {
    if (!open) {
      setCaptureState(null);
      return;
    }
    setBackground(isDark ? "dark" : "light");
    setScale(window.devicePixelRatio || 1);
    setPadding(30);
    setCaptureState(null);
  }, [open, isDark]);

  const modalTitle = useMemo(() => {
    return exportAction === "selection" ? "导出元素为图片" : "导出白板为图片";
  }, [exportAction]);

  const handleExport = useMemoizedFn(async () => {
    if (exporting) return;

    const sourceElements = resolveExportElements({
      board,
      action: exportAction,
      selectedElementIds,
    });
    const elements = sourceElements;

    if (elements.length === 0) {
      message.warning(exportAction === "selection" ? "没有可导出的元素" : "白板中没有可导出的元素");
      return;
    }

    const bounds = calculateExportBounds(board, elements);
    if (!bounds) {
      message.error("无法计算导出范围，请重试");
      return;
    }

    const exportViewPort = createExportViewPort(bounds, padding);
    const selectedIds = new Set(
      (board.selection.selectedElements || []).map(element => element.id)
    );
    const groups = splitElementsForRender(elements, selectedIds);
    const backgroundColor = resolveExportBackgroundColor(background);
    const previousSelection = cloneSelection(board.selection);

    setExporting(true);
    try {
      board.apply(
        {
          type: "set_selection",
          properties: board.selection,
          newProperties: {
            selectedElements: [],
            selectArea: null,
          },
        },
        false
      );

      setCaptureState({
        elements,
        viewPort: exportViewPort,
        backgroundColor,
        centerConnectArrows: groups.centerConnectArrows,
        noneCenterConnectArrows: groups.noneCenterConnectArrows,
        centerConnectAndSelectedArrows: groups.centerConnectAndSelectedArrows,
      });

      await waitDoubleRaf();
      await waitDoubleRaf();

      const captureTarget = captureContainerRef.current;
      if (!captureTarget) {
        throw new Error("导出画布尚未准备完成");
      }

      // 如果存在使用异步媒体组件的元素，等待它们完成 URL 解析并渲染到 DOM
      // LocalImage / LocalVideo / LocalAudio 在解析期间返回 null，需要轮询等待
      const hasAsyncMedia = elements.some(
        el =>
          el.type === "image" || el.type === "card" || el.type === "video" || el.type === "audio"
      );
      if (hasAsyncMedia) {
        await waitForMediaRender(captureTarget);
      }

      await prepareCaptureNode(captureTarget);
      await waitDoubleRaf();

      const exportDpr = scale > 0 ? scale : 1;
      const blob = await captureBlobWithSnapdom(captureTarget, {
        dpr: exportDpr,
        type: "png",
        quality: 0.95,
        filter: element => {
          return !(element as HTMLElement)?.dataset?.exportIgnore;
        },
        filterMode: "hide",
      });

      downloadBlobAsFile(blob, createExportFilename(exportAction));
      message.success("图片导出成功");
      onClose();
    } catch (error) {
      console.error("Export whiteboard image failed:", error);
      message.error("导出失败，请重试");
    } finally {
      setCaptureState(null);

      board.apply(
        {
          type: "set_selection",
          properties: board.selection,
          newProperties: previousSelection,
        },
        false
      );

      setExporting(false);
    }
  });

  return (
    <>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="z-9999 fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
              onClick={onClose}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="m-4 w-full max-w-[460px]"
                onClick={e => e.stopPropagation()}
              >
                <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-zinc-900/95">
                  {/* Header */}
                  <div className="mb-5 flex items-start gap-3">
                    <div className="border-[var(--th-border-focus)]/30 dark:bg-[var(--th-accent)]/20 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border bg-[var(--th-accent-soft)]">
                      <Download className="h-5 w-5 text-[var(--th-accent)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="m-0 text-base font-bold text-gray-800 dark:text-white">
                        {modalTitle}
                      </h2>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-500">
                        调整导出参数后点击导出
                      </p>
                    </div>
                    <button
                      onClick={onClose}
                      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-gray-100 text-gray-500 transition-all hover:bg-gray-200 hover:text-gray-700 dark:bg-zinc-800 dark:text-slate-400 dark:hover:bg-zinc-700 dark:hover:text-slate-200"
                    >
                      <svg
                        className="h-[18px] w-[18px]"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Form */}
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-gray-700 dark:text-slate-300">背景</span>
                      <SegmentedControl
                        options={BACKGROUND_OPTIONS}
                        value={background}
                        onChange={value => setBackground(value)}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-gray-700 dark:text-slate-300">放大倍数</span>
                      <NumberStepper
                        value={scale}
                        onChange={value => setScale(Number(value) || 1)}
                        min={0.5}
                        max={4}
                        step={0.25}
                        precision={2}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-gray-700 dark:text-slate-300">边距</span>
                      <NumberStepper
                        value={padding}
                        onChange={value => setPadding(Math.max(0, Number(value) || 0))}
                        min={0}
                        max={500}
                        step={1}
                        precision={0}
                      />
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-5 flex gap-3 border-t border-gray-200 pt-4 dark:border-slate-700">
                    <button
                      className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 dark:border-slate-700 dark:bg-zinc-800 dark:text-slate-300 dark:hover:bg-zinc-700"
                      onClick={onClose}
                      disabled={exporting}
                    >
                      取消
                    </button>
                    <button
                      className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-[var(--th-btn-bg)] px-5 py-3 text-sm font-semibold text-[var(--th-btn-text)] shadow-sm transition-all hover:-translate-y-px hover:bg-[var(--th-btn-hover)] active:translate-y-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:bg-zinc-800 dark:disabled:text-slate-500"
                      onClick={handleExport}
                      disabled={exporting}
                    >
                      {exporting && (
                        <svg
                          className="h-4 w-4 animate-spin"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <circle
                            cx="12"
                            cy="12"
                            r="9"
                            stroke="currentColor"
                            strokeOpacity="0.35"
                          />
                          <path
                            d="M12 3a9 9 0 0 1 9 9"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeOpacity="0.85"
                          />
                        </svg>
                      )}
                      {exporting ? "导出中..." : "导出"}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {captureState && (
        <div
          ref={captureContainerRef}
          data-whiteboard-export-capture="true"
          style={{
            position: "fixed",
            left: 0,
            top: 0,
            width: `${captureState.viewPort.width}px`,
            height: `${captureState.viewPort.height}px`,
            pointerEvents: "none",
            zIndex: -1,
            overflow: "hidden",
            isolation: "isolate",
          }}
        >
          <BoardContent
            board={board}
            viewPort={captureState.viewPort}
            centerConnectArrows={captureState.centerConnectArrows}
            noneCenterConnectArrows={captureState.noneCenterConnectArrows}
            centerConnectAndSelectedArrows={captureState.centerConnectAndSelectedArrows}
            gridVisible={false}
            refLines={EMPTY_REF_LINES}
            disableViewportFilter={true}
            showAssistLayers={false}
            backgroundColor={captureState.backgroundColor}
            renderElementsOverride={captureState.elements}
          />
        </div>
      )}
    </>
  );
};

export default ExportImageModal;
