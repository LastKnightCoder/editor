/**
 * 画布离屏截图（导出图片 / 列表缩略图共用）：把指定元素按导出视口渲染进一块屏外容器，
 * 等异步媒体就绪后用 snapdom 截成图片。截图层是独立 DOM，不改动画布本身。
 *
 * 用法：`const { capture, layer } = useBoardCapture(board)`，把 layer 渲染在 BoardContext
 * 等 Provider 之内（元素组件依赖这些上下文），再 `await capture(options)`。
 */

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useMemoizedFn } from "ahooks";
import { captureBlobWithSnapdom } from "@/utils/snapdom-export";
import Board from "../Board";
import BoardContent from "../components/BoardContent";
import { SelectionContext } from "../context";
import type { BoardElement, Selection, ViewPort } from "../types";
import { calculateExportBounds, createExportViewPort } from "../utils";
import { isInteriorConnectElement } from "../utils/ConnectPointUtil";

export interface BoardCaptureOptions {
  elements: BoardElement[];
  padding: number;
  backgroundColor: string | null;
  /** 输出像素比；传函数时按导出视口计算（缩略图按目标宽度缩放） */
  dpr: number | ((viewPort: ViewPort) => number);
  type?: "png" | "webp" | "jpeg";
  quality?: number;
  /** 把导出视口扩成该宽高比（内容居中），缩略图用来对齐卡片比例 */
  aspect?: number;
  /**
   * 按「无选区」渲染但不改动画布选区（后台缩略图用，避免打扰正在编辑的用户）；
   * 缺省时由调用方自行清空选区（导出图片的做法）。
   */
  isolateSelection?: boolean;
}

interface CaptureRenderState {
  elements: BoardElement[];
  viewPort: ViewPort;
  backgroundColor: string | null;
  isolateSelection: boolean;
  centerConnectArrows: BoardElement[];
  noneCenterConnectArrows: BoardElement[];
  centerConnectAndSelectedArrows: BoardElement[];
}

const EMPTY_SELECTION: Selection = { selectArea: null, selectedElements: [] };

const splitElementsForRender = (elements: BoardElement[], selectedIds: Set<string>) => {
  const centerConnectArrows: BoardElement[] = [];
  const noneCenterConnectArrows: BoardElement[] = [];
  const centerConnectAndSelectedArrows: BoardElement[] = [];

  for (const element of elements) {
    if (!isInteriorConnectElement(element)) {
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

const expandToAspect = (viewPort: ViewPort, aspect: number): ViewPort => {
  const { minX, minY, width, height } = viewPort;
  if (width / height > aspect) {
    const nextHeight = width / aspect;
    return { ...viewPort, minY: minY - (nextHeight - height) / 2, height: nextHeight };
  }
  const nextWidth = height * aspect;
  return { ...viewPort, minX: minX - (nextWidth - width) / 2, width: nextWidth };
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
 * 等待异步媒体组件（LocalImage / LocalVideo）完成 URL 解析并将标签渲染到 DOM
 *
 * 这些组件在异步解析 URL 期间返回 null，导致 DOM 中暂时不存在对应标签
 * （LocalAudio 解析期间渲染加载占位，audio 标签始终存在）。
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

export function useBoardCapture(board: Board): {
  /** 元素为空或无法计算范围时返回 null；同一时刻只跑一次，重入返回 null */
  capture: (options: BoardCaptureOptions) => Promise<Blob | null>;
  layer: ReactNode;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const runningRef = useRef(false);
  const [state, setState] = useState<CaptureRenderState | null>(null);

  const capture = useMemoizedFn(async (options: BoardCaptureOptions): Promise<Blob | null> => {
    const { elements, padding, backgroundColor, dpr, type = "png", quality = 0.95 } = options;
    if (runningRef.current || elements.length === 0) return null;
    const bounds = calculateExportBounds(board, elements);
    if (!bounds) return null;

    runningRef.current = true;
    try {
      let viewPort = createExportViewPort(bounds, padding);
      if (options.aspect) viewPort = expandToAspect(viewPort, options.aspect);
      const isolateSelection = Boolean(options.isolateSelection);
      const selectedIds = isolateSelection
        ? new Set<string>()
        : new Set((board.selection.selectedElements || []).map(element => element.id));
      setState({
        elements,
        viewPort,
        backgroundColor,
        isolateSelection,
        ...splitElementsForRender(elements, selectedIds),
      });

      await waitDoubleRaf();
      await waitDoubleRaf();

      const captureTarget = containerRef.current;
      if (!captureTarget) {
        throw new Error("导出画布尚未准备完成");
      }

      // 如果存在使用异步媒体组件的元素，等待它们完成 URL 解析并渲染到 DOM
      // LocalImage / LocalVideo 在解析期间返回 null，需要轮询等待
      const hasAsyncMedia = elements.some(
        el =>
          el.type === "image" || el.type === "card" || el.type === "video" || el.type === "audio"
      );
      if (hasAsyncMedia) {
        await waitForMediaRender(captureTarget);
      }

      await prepareCaptureNode(captureTarget);
      await waitDoubleRaf();

      const ratio = typeof dpr === "function" ? dpr(viewPort) : dpr;
      return await captureBlobWithSnapdom(captureTarget, {
        dpr: ratio > 0 ? ratio : 1,
        type,
        quality,
        filter: element => {
          return !(element as HTMLElement)?.dataset?.exportIgnore;
        },
        filterMode: "hide",
      });
    } finally {
      setState(null);
      runningRef.current = false;
    }
  });

  const layer = useMemo(() => {
    if (!state) return null;
    const content = (
      <BoardContent
        board={board}
        viewPort={state.viewPort}
        centerConnectArrows={state.centerConnectArrows}
        noneCenterConnectArrows={state.noneCenterConnectArrows}
        centerConnectAndSelectedArrows={state.centerConnectAndSelectedArrows}
        gridVisible={false}
        disableViewportFilter={true}
        isolateStaticSelection={state.isolateSelection}
        showAssistLayers={false}
        backgroundColor={state.backgroundColor}
        renderElementsOverride={state.elements}
      />
    );
    return (
      <div
        ref={containerRef}
        data-whiteboard-export-capture="true"
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: `${state.viewPort.width}px`,
          height: `${state.viewPort.height}px`,
          pointerEvents: "none",
          zIndex: -1,
          overflow: "hidden",
          isolation: "isolate",
        }}
      >
        {state.isolateSelection ? (
          <SelectionContext.Provider value={EMPTY_SELECTION}>{content}</SelectionContext.Provider>
        ) : (
          content
        )}
      </div>
    );
  }, [board, state]);

  return { capture, layer };
}
