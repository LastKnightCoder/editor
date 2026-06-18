import { useEffect, useMemo, useRef, useState } from "react";
import { App, InputNumber, Select } from "antd";
import { useMemoizedFn } from "ahooks";
import useTheme from "@/hooks/useTheme";
import CustomModal from "@/components/CustomModal";
import { captureBlobWithSnapdom } from "@/utils/snapdom-export";
import Board from "../../Board";
import BoardContent from "../BoardContent";
import type { BoardElement, ViewPort } from "../../types";
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

const isCenterConnectArrow = isInteriorConnectElement;

const splitElementsForRender = (
  elements: BoardElement[],
  selectedIds: Set<string>,
) => {
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
  new Promise<void>((resolve) => {
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
const waitForMediaRender = async (
  captureTarget: Element,
  maxWaitMs = 15000,
): Promise<void> => {
  const POLL_INTERVAL = 200;
  const STABLE_THRESHOLD = 3;
  const startTime = Date.now();
  let previousCount = -1;
  let stableChecks = 0;

  const countMediaElements = () =>
    captureTarget.querySelectorAll("img, video, audio").length;

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

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
  captureTarget
    .querySelectorAll<HTMLElement>("[id^='rich-text-container-']")
    .forEach((element) => {
      element.style.boxShadow = "none";
    });

  // 将 contenteditable 元素设为不可编辑，避免导出时出现光标和编辑态样式
  captureTarget
    .querySelectorAll<HTMLElement>(
      "[contenteditable='true'], [contenteditable='plaintext-only'], [data-slate-editor], [data-slate-editor='true']",
    )
    .forEach((element) => {
      element.blur?.();
      element.setAttribute("contenteditable", "false");
      element.style.caretColor = "transparent";
    });

  const unstableTags = [
    "video",
    "audio",
    "iframe",
    "webview",
    "object",
    "embed",
  ];
  unstableTags.forEach((tagName) => {
    captureTarget.querySelectorAll(tagName).forEach((element) => {
      markNodeIgnored(element);
    });
  });

  const images = Array.from(captureTarget.querySelectorAll("img"));
  await Promise.all(
    images.map(async (image) => {
      image.setAttribute("loading", "eager");
      image.setAttribute("decoding", "sync");
      try {
        await waitImageReady(image);
      } catch (_error) {
        markNodeIgnored(image);
      }
    }),
  );
};

const ExportImageModal = (props: ExportImageModalProps) => {
  const { open, onClose, board, action, selectedElementIds } = props;
  const { message } = App.useApp();
  const { isDark } = useTheme();
  const captureContainerRef = useRef<HTMLDivElement>(null);

  const [background, setBackground] = useState<ExportImageBackgroundMode>(
    isDark ? "dark" : "light",
  );
  const [scale, setScale] = useState<number>(window.devicePixelRatio || 1);
  const [padding, setPadding] = useState<number>(30);
  const [exporting, setExporting] = useState(false);
  const [captureState, setCaptureState] = useState<CaptureRenderState | null>(
    null,
  );

  const exportAction: ExportImageAction =
    action === "selection" ? "selection" : "board";

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
      message.warning(
        exportAction === "selection"
          ? "没有可导出的元素"
          : "白板中没有可导出的元素",
      );
      return;
    }

    const bounds = calculateExportBounds(board, elements);
    if (!bounds) {
      message.error("无法计算导出范围，请重试");
      return;
    }

    const exportViewPort = createExportViewPort(bounds, padding);
    const selectedIds = new Set(
      (board.selection.selectedElements || []).map((element) => element.id),
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
        false,
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
        (el) =>
          el.type === "image" ||
          el.type === "card" ||
          el.type === "video" ||
          el.type === "audio",
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
        filter: (element) => {
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
        false,
      );

      setExporting(false);
    }
  });

  return (
    <>
      <CustomModal
        open={open}
        title={modalTitle}
        onCancel={onClose}
        onOk={handleExport}
        okText={exporting ? "导出中..." : "导出"}
        cancelText="取消"
        confirmLoading={exporting}
        width={460}
      >
        <div className="flex flex-col gap-4">
          <label className="flex items-center justify-between gap-4">
            <span>背景</span>
            <Select<ExportImageBackgroundMode>
              value={background}
              style={{ width: 220 }}
              options={[
                { value: "light", label: "白色" },
                { value: "dark", label: "深色" },
                { value: "transparent", label: "透明" },
              ]}
              onChange={(value) => setBackground(value)}
            />
          </label>
          <label className="flex items-center justify-between gap-4">
            <span>放大倍数</span>
            <InputNumber
              value={scale}
              min={0.5}
              max={4}
              step={0.25}
              precision={2}
              style={{ width: 220 }}
              onChange={(value) => setScale(Number(value) || 1)}
            />
          </label>
          <label className="flex items-center justify-between gap-4">
            <span>边距</span>
            <InputNumber
              value={padding}
              min={0}
              max={500}
              step={1}
              precision={0}
              style={{ width: 220 }}
              onChange={(value) => setPadding(Math.max(0, Number(value) || 0))}
            />
          </label>
        </div>
      </CustomModal>

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
            centerConnectAndSelectedArrows={
              captureState.centerConnectAndSelectedArrows
            }
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
