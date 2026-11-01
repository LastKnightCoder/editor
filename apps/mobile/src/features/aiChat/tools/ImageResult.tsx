// 图片生成 / 编辑的结果：直接把图画在对话里，生成中先占好位置；点图全屏查看，左右滑切换。

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImageOff, Sparkles, X } from "lucide-react";
import type { ToolCallExecutionState } from "@tau/shared/chat-renderers";
import { cn } from "@tau/ui";
import { resolveLocalMediaSource } from "../../../components/editor/localMedia";
import { useScrollLock } from "../../../hooks/useScrollLock";
import { useSheetBackDismiss } from "../../../router/useSheetBackDismiss";
import { Z_INDEX } from "../../../router/zIndex";
import { num, parseObject } from "./format";
import { parseImagePayload, type ImagePayload } from "./results";

function useImageSrc(url: string) {
  const [state, setState] = useState<{ src: string | null; failed: boolean }>({
    src: null,
    failed: false,
  });
  useEffect(() => {
    let active = true;
    resolveLocalMediaSource(url).then(
      src => active && setState({ src, failed: false }),
      () => active && setState({ src: null, failed: true })
    );
    return () => {
      active = false;
    };
  }, [url]);
  return state;
}

function Tile(props: { url: string; alt: string; wide: boolean; onOpen(): void }) {
  const { src, failed } = useImageSrc(props.url);
  return (
    <button
      type="button"
      aria-label="查看大图"
      onClick={props.onOpen}
      className={cn(
        "bg-surface relative grid overflow-hidden rounded-[14px] place-items-center",
        props.wide ? "aspect-[4/3]" : "aspect-square"
      )}
    >
      {src ? (
        <img src={src} alt={props.alt} className="size-full object-cover" />
      ) : failed ? (
        <ImageOff size={20} aria-hidden className="text-ink-3" />
      ) : (
        <span className="bg-surface-hover size-full animate-pulse" />
      )}
    </button>
  );
}

function ViewerSlide(props: { url: string; alt: string }) {
  const { src } = useImageSrc(props.url);
  return (
    <div className="grid h-full w-full shrink-0 snap-center place-items-center">
      {src && <img src={src} alt={props.alt} className="max-h-full max-w-full object-contain" />}
    </div>
  );
}

/** 全屏看图：固定黑底（照片在深底上最清楚），左右滑切换，返回手势或 × 关闭 */
function ImageViewer(props: { payload: ImagePayload; index: number; onClose(): void }) {
  const { images } = props.payload;
  const [current, setCurrent] = useState(props.index);
  const trackRef = useRef<HTMLDivElement>(null);
  useScrollLock(true);
  useSheetBackDismiss(true, props.onClose);
  useEffect(() => {
    const track = trackRef.current;
    if (track) track.scrollLeft = props.index * track.clientWidth;
  }, [props.index]);
  const image = images[current];
  return createPortal(
    <div
      className="fixed inset-0 flex flex-col bg-black text-white"
      style={{ zIndex: Z_INDEX.CONFIRM, paddingTop: "var(--mobile-safe-top)" }}
    >
      <div className="flex h-12 items-center justify-between px-2">
        <button
          type="button"
          aria-label="关闭"
          onClick={props.onClose}
          className="grid size-11 place-items-center"
        >
          <X size={22} aria-hidden />
        </button>
        {images.length > 1 && (
          <span className="text-tau-meta tabular-nums opacity-80">
            {current + 1} / {images.length}
          </span>
        )}
        <span className="size-11" />
      </div>
      <div
        ref={trackRef}
        data-allow-touchmove="true"
        onScroll={event => {
          const track = event.currentTarget;
          setCurrent(Math.round(track.scrollLeft / Math.max(track.clientWidth, 1)));
        }}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
      >
        {images.map((item, index) => (
          <ViewerSlide
            key={item.url + index}
            url={item.url}
            alt={item.revisedPrompt ?? props.payload.prompt}
          />
        ))}
      </div>
      {(image?.revisedPrompt || props.payload.prompt) && (
        <p
          className="text-tau-meta px-5 pt-3 leading-[1.6] text-white/70"
          style={{ paddingBottom: "calc(var(--mobile-safe-bottom) + 16px)" }}
        >
          {image?.revisedPrompt || props.payload.prompt}
        </p>
      )}
    </div>,
    document.body
  );
}

export function ImageGrid(props: { payload: ImagePayload }) {
  const [viewing, setViewing] = useState<number | null>(null);
  const { images } = props.payload;
  return (
    <>
      <div className={cn("grid gap-1.5", images.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
        {images.map((image, index) => (
          <Tile
            key={image.url + index}
            url={image.url}
            alt={image.revisedPrompt ?? props.payload.prompt}
            wide={images.length === 1}
            onOpen={() => setViewing(index)}
          />
        ))}
      </div>
      {viewing !== null && (
        <ImageViewer payload={props.payload} index={viewing} onClose={() => setViewing(null)} />
      )}
    </>
  );
}

/** 对话里的图片块：生成中按张数占位，完成后原地换成图片 */
export function ImageResult(props: { execution: ToolCallExecutionState }) {
  const { execution } = props;
  if (execution.status === "pending" || execution.status === "executing") {
    const count = Math.min(Math.max(num(parseObject(execution.input)?.n) ?? 1, 1), 4);
    return (
      <div className={cn("my-1.5 grid gap-1.5", count > 1 ? "grid-cols-2" : "grid-cols-1")}>
        {Array.from({ length: count }, (_, index) => (
          <span
            key={index}
            className={cn(
              "bg-surface animate-pulse rounded-[14px]",
              count > 1 ? "aspect-[16/10]" : "aspect-[4/3]"
            )}
          />
        ))}
      </div>
    );
  }
  const payload = execution.status === "success" ? parseImagePayload(execution) : null;
  if (!payload) return null;
  return (
    <div className="my-1.5">
      <ImageGrid payload={payload} />
      <div className="text-tau-sm text-ink-3 mt-1.5 flex items-center gap-1.5">
        <Sparkles size={13} aria-hidden />
        已保存到资源库 · 点开查看大图
      </div>
    </div>
  );
}
