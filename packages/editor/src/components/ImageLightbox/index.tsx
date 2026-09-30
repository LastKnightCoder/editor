import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSlateStatic } from "slate-react";
import { cn, usePortalContainer } from "@tau/ui";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Maximize,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { useEditorSlots, useNotifier } from "../../services";
import { fileNameOfUrl, useImageLightboxStore } from "../../stores";
import { copyImageElement, imageElementToBlob } from "../../utils/imageBlob";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;
const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

// 看图的全屏场景固定深色，不随主题（照片在深底上最清楚，浅色主题的遮罩也压不住画面）
const barButtonClass =
  "grid size-8 shrink-0 place-items-center rounded-tau-sm text-white/75 transition-colors hover:bg-white/10 hover:text-white";

/**
 * 图片灯箱（暗房）：文档里的所有图片，底部缩略条可跳转。
 * 滚轮以指针为锚缩放、放大后拖动、双击在适应与 200% 间切换；
 * ← → 切换、+ − 0 缩放、Esc 关闭（焦点链内处理，不冒泡）。点图片本身不关闭，点空白处关闭。
 */
const ImageLightbox = () => {
  const editor = useSlateStatic();
  const { owner, items, index, setIndex, close } = useImageLightboxStore(state => ({
    owner: state.editor,
    items: state.items,
    index: state.index,
    setIndex: state.setIndex,
    close: state.close,
  }));
  const open = owner === editor && items.length > 0;
  if (!open) return null;
  return <LightboxView items={items} index={index} setIndex={setIndex} close={close} />;
};

type LightboxViewProps = Pick<
  ReturnType<typeof useImageLightboxStore.getState>,
  "items" | "index" | "setIndex" | "close"
>;

const LightboxView = ({ items, index, setIndex, close }: LightboxViewProps) => {
  const portalContainer = usePortalContainer();
  const { Image } = useEditorSlots();
  const notifier = useNotifier();
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const filmRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const item = items[index];
  const hasMany = items.length > 1;

  // 打开时接管焦点，关闭时还给原处
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    rootRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    filmRef.current
      ?.querySelector<HTMLElement>(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [index]);

  /** 以舞台内某点为锚缩放：锚点下的像素保持不动 */
  const zoomAt = useCallback(
    (nextZoom: number, anchor?: { x: number; y: number }) => {
      const target = clampZoom(nextZoom);
      const k = target / zoom;
      const a = anchor ?? { x: 0, y: 0 };
      setZoom(target);
      setPan(
        target <= 1 ? { x: 0, y: 0 } : { x: a.x - (a.x - pan.x) * k, y: a.y - (a.y - pan.y) * k }
      );
    },
    [pan, zoom]
  );

  const anchorOf = (event: { clientX: number; clientY: number }) => {
    const rect = stageRef.current!.getBoundingClientRect();
    return {
      x: event.clientX - rect.left - rect.width / 2,
      y: event.clientY - rect.top - rect.height / 2,
    };
  };

  // React 的 wheel 是 passive 的，拦截页面滚动需要原生监听
  const zoomAtRef = useRef(zoomAt);
  zoomAtRef.current = zoomAt;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002));
      zoomAtRef.current(zoomRef.current * factor, anchorOf(event));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

  const go = (delta: number) => {
    if (hasMany) setIndex((index + delta + items.length) % items.length);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
    const handled = (() => {
      switch (event.key) {
        case "Escape":
          close();
          return true;
        case "ArrowLeft":
          go(-1);
          return true;
        case "ArrowRight":
          go(1);
          return true;
        case "+":
        case "=":
          zoomAt(zoom * 1.25);
          return true;
        case "-":
          zoomAt(zoom / 1.25);
          return true;
        case "0":
          zoomAt(1);
          return true;
        default:
          return false;
      }
    })();
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const copyImage = async () => {
    const img = imageRef.current;
    const ok = img ? await copyImageElement(img) : false;
    if (ok) notifier.success("图片已复制");
    else notifier.error("复制失败：图片来源不允许读取");
  };

  const downloadImage = async () => {
    const img = imageRef.current;
    const blob = img ? await imageElementToBlob(img) : null;
    if (!blob) {
      notifier.error("下载失败：图片来源不允许读取");
      return;
    }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileNameOfUrl(item.url).replace(/\.[^.]+$/, "") + ".png";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return createPortal(
    <div
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      className="fixed inset-0 z-[1100] flex flex-col bg-[#0e0e0f] text-white outline-none"
      onKeyDown={handleKeyDown}
    >
      {/* 顶栏：文件名 · 张数 / 缩放 / 操作 / 关闭 */}
      <div className="text-tau-meta flex shrink-0 items-center gap-1 py-2.5 pl-5 pr-3">
        <span className="truncate text-white/90">{item.alt}</span>
        {hasMany && (
          <span className="font-tau-mono ml-2.5 shrink-0 tabular-nums text-white/50">
            {index + 1} / {items.length}
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          title="缩小 (−)"
          className={barButtonClass}
          onClick={() => zoomAt(zoom / 1.25)}
        >
          <ZoomOut size={16} />
        </button>
        <span className="font-tau-mono text-tau-sm w-12 text-center tabular-nums text-white/75">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          title="放大 (+)"
          className={barButtonClass}
          onClick={() => zoomAt(zoom * 1.25)}
        >
          <ZoomIn size={16} />
        </button>
        <button
          type="button"
          title="适应窗口 (0)"
          className={barButtonClass}
          onClick={() => zoomAt(1)}
        >
          <Maximize size={16} />
        </button>
        <span className="w-2.5" />
        <button
          type="button"
          title="复制图片"
          className={barButtonClass}
          onClick={() => void copyImage()}
        >
          <Copy size={16} />
        </button>
        <button
          type="button"
          title="下载"
          className={barButtonClass}
          onClick={() => void downloadImage()}
        >
          <Download size={16} />
        </button>
        <span className="w-2.5" />
        <button type="button" title="关闭 (Esc)" className={barButtonClass} onClick={close}>
          <X size={17} />
        </button>
      </div>

      {/* 舞台 */}
      <div
        ref={stageRef}
        className={cn(
          "relative min-h-0 flex-1 overflow-hidden",
          zoom > 1 && (dragging ? "cursor-grabbing" : "cursor-grab")
        )}
        onPointerDown={event => {
          if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
          dragRef.current = { x: event.clientX - pan.x, y: event.clientY - pan.y, moved: false };
          if (zoom > 1) {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(true);
          }
        }}
        onPointerMove={event => {
          const drag = dragRef.current;
          if (!drag || zoom <= 1) return;
          drag.moved = true;
          setPan({ x: event.clientX - drag.x, y: event.clientY - drag.y });
        }}
        onPointerUp={event => {
          const drag = dragRef.current;
          dragRef.current = null;
          setDragging(false);
          // 未放大时点空白处关闭；点在图片上不关
          if (drag && !drag.moved && zoom <= 1 && event.target === event.currentTarget) close();
        }}
      >
        <div className="pointer-events-none absolute inset-x-16 inset-y-4 flex items-center justify-center">
          <Image
            key={item.url}
            ref={imageRef}
            url={item.url}
            alt={item.alt}
            crossOrigin="anonymous"
            className={cn(
              "pointer-events-auto max-h-full max-w-full select-none object-contain",
              !dragging && "ease-tau-out transition-transform duration-200"
            )}
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
            onDoubleClick={event => zoomAt(zoom > 1 ? 1 : 2, anchorOf(event))}
            draggable={false}
          />
        </div>
        {hasMany && (
          <>
            <button
              type="button"
              title="上一张 (←)"
              className="absolute left-4 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              onClick={() => go(-1)}
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              title="下一张 (→)"
              className="absolute right-4 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              onClick={() => go(1)}
            >
              <ChevronRight size={20} />
            </button>
          </>
        )}
      </div>

      {/* 说明 + 缩略条 */}
      <div className="text-tau-meta min-h-[1.5em] shrink-0 px-6 pb-2 pt-1 text-center text-white/60">
        {item.caption}
      </div>
      {hasMany && (
        <div
          ref={filmRef}
          className="flex shrink-0 justify-center gap-2 overflow-x-auto px-6 pb-4 pt-1"
        >
          {items.map((thumb, thumbIndex) => (
            <button
              key={`${thumbIndex}-${thumb.url}`}
              type="button"
              data-index={thumbIndex}
              title={thumb.alt}
              onClick={() => setIndex(thumbIndex)}
              className={cn(
                "relative h-9 w-[54px] shrink-0 overflow-hidden rounded-[6px] outline outline-2 outline-offset-2 transition-opacity",
                thumbIndex === index
                  ? "outline-accent opacity-100"
                  : "opacity-50 outline-transparent hover:opacity-85"
              )}
            >
              <Image url={thumb.url} alt={thumb.alt} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>,
    portalContainer
  );
};

export default ImageLightbox;
