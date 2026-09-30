import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, cn, usePortalContainer } from "@tau/ui";
import { Check, CircleAlert, FlipHorizontal2, RotateCcw } from "lucide-react";

import {
  MAX_STRAIGHTEN,
  applyAspect,
  clampCenter,
  ensureCover,
  flipHorizontal,
  fromTransform,
  identityTransform,
  isCropTransform,
  naturalAspect,
  refit,
  dragFrameHandle,
  rotateQuarter,
  rotationOf,
  setStraighten,
  toTransform,
  zoomAround,
  type CropViewState,
  type FrameHandle,
  type ImageCropTransform,
  type Size,
  type Vec,
} from "./geometry";
import { exportCrop, outputFormatOf } from "./exportCrop";

export type { ImageCropTransform } from "./geometry";

export interface ImageCropEditorProps {
  /** 原图的可加载地址（宿主已解析过的本地 / 远程地址） */
  imageSrc: string;
  /** 原图的节点地址，用于决定输出格式 */
  originalUrl: string;
  /** 上次的裁剪参数；非 v2 参数（旧版 cropperjs）按原图重新开始 */
  initialTransform?: unknown;
  onCancel: () => void;
  onConfirm: (result: { transform: ImageCropTransform; blob: Blob; ext: string }) => Promise<void>;
}

type AspectKey = "original" | "free" | "1:1" | "4:3" | "3:2" | "16:9" | "3:4";

const ASPECTS: { key: AspectKey; label: string; value?: number }[] = [
  { key: "original", label: "原始" },
  { key: "free", label: "自由" },
  { key: "1:1", label: "1:1", value: 1 },
  { key: "4:3", label: "4:3", value: 4 / 3 },
  { key: "3:2", label: "3:2", value: 3 / 2 },
  { key: "16:9", label: "16:9", value: 16 / 9 },
  { key: "3:4", label: "3:4", value: 3 / 4 },
];

const HANDLES: { handle: FrameHandle; className: string; cursor: string }[] = [
  {
    handle: "nw",
    className: "-left-[3px] -top-[3px] size-[18px] border-l-[3px] border-t-[3px]",
    cursor: "nwse-resize",
  },
  {
    handle: "ne",
    className: "-right-[3px] -top-[3px] size-[18px] border-r-[3px] border-t-[3px]",
    cursor: "nesw-resize",
  },
  {
    handle: "sw",
    className: "-bottom-[3px] -left-[3px] size-[18px] border-b-[3px] border-l-[3px]",
    cursor: "nesw-resize",
  },
  {
    handle: "se",
    className: "-bottom-[3px] -right-[3px] size-[18px] border-b-[3px] border-r-[3px]",
    cursor: "nwse-resize",
  },
  {
    handle: "n",
    className: "-top-[4px] left-1/2 h-[3px] w-6 -translate-x-1/2",
    cursor: "ns-resize",
  },
  {
    handle: "s",
    className: "-bottom-[4px] left-1/2 h-[3px] w-6 -translate-x-1/2",
    cursor: "ns-resize",
  },
  {
    handle: "w",
    className: "-left-[4px] top-1/2 h-6 w-[3px] -translate-y-1/2",
    cursor: "ew-resize",
  },
  {
    handle: "e",
    className: "-right-[4px] top-1/2 h-6 w-[3px] -translate-y-1/2",
    cursor: "ew-resize",
  },
];

/** 裁剪框内三分线：只在拖动 / 调整时显示 */
const Thirds = () => (
  <span aria-hidden className="pointer-events-none absolute inset-0">
    <span className="absolute inset-y-0 left-1/3 w-px bg-white/50" />
    <span className="absolute inset-y-0 left-2/3 w-px bg-white/50" />
    <span className="absolute inset-x-0 top-1/3 h-px bg-white/50" />
    <span className="absolute inset-x-0 top-2/3 h-px bg-white/50" />
  </span>
);

const aspectKeyOf = (aspect: number | null, natural: number): AspectKey => {
  if (aspect == null) return "free";
  if (Math.abs(aspect - natural) < 1e-3) return "original";
  return ASPECTS.find(item => item.value && Math.abs(item.value - aspect) < 1e-3)?.key ?? "free";
};

type Gesture =
  | { kind: "pan"; start: Vec; center: Vec }
  | { kind: "frame"; start: Vec; view: CropViewState; handle: FrameHandle };

/**
 * 全屏裁剪编辑器：拖把手调裁剪框、拖画面平移、滚轮缩放、拨盘微调角度，
 * 比例 / 90° 旋转 / 翻转 / 还原一行排开；Enter 完成、Esc 取消。
 * 看图与修图的全屏场景固定深色，不随主题（同灯箱）。
 */
const ImageCropEditor = ({
  imageSrc,
  originalUrl,
  initialTransform,
  onCancel,
  onConfirm,
}: ImageCropEditorProps) => {
  const portalContainer = usePortalContainer();
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [image, setImage] = useState<Size | null>(null);
  const [stage, setStage] = useState<Size | null>(null);
  const [view, setView] = useState<CropViewState | null>(null);
  const [aspectKey, setAspectKey] = useState<AspectKey>("free");
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [animating, setAnimating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ---- 载入原图（crossOrigin 让导出时画布不被污染） ----
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      setImage({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => setError("原图加载失败，无法裁剪");
    img.src = imageSrc;
  }, [imageSrc]);

  // ---- 舞台尺寸：窗口变化时重新铺满 ----
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!image || !stage) return;
    setView(prev => {
      if (prev) return refit(prev, stage);
      const initial = isCropTransform(initialTransform)
        ? initialTransform
        : identityTransform(image);
      setAspectKey(aspectKeyOf(initial.aspect, naturalAspect(image, initial.quarterTurns)));
      return ensureCover(fromTransform(initial, stage), image);
    });
  }, [image, stage, initialTransform]);

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  /** 带过渡地更新视图（松手重新铺满、旋转、还原等离散操作） */
  const animateTo = useCallback((next: CropViewState) => {
    setAnimating(true);
    setView(next);
    window.setTimeout(() => setAnimating(false), 220);
  }, []);

  const localPoint = (event: { clientX: number; clientY: number }): Vec => {
    const rect = stageRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  // ---- 手势：平移 / 调框 ----
  const startGesture = (event: React.PointerEvent, handle?: FrameHandle) => {
    if (!view || event.button !== 0 || saving) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const start = localPoint(event);
    setGesture(
      handle ? { kind: "frame", start, view, handle } : { kind: "pan", start, center: view.center }
    );
  };

  const moveGesture = (event: React.PointerEvent) => {
    if (!gesture || !view || !image || !stage) return;
    const point = localPoint(event);
    const delta = { x: point.x - gesture.start.x, y: point.y - gesture.start.y };
    if (gesture.kind === "pan") {
      const target = { x: gesture.center.x + delta.x, y: gesture.center.y + delta.y };
      setView({ ...view, center: clampCenter(view, image, target) });
    } else {
      setView(dragFrameHandle(gesture.view, gesture.handle, delta, image, stage));
    }
  };

  const endGesture = () => {
    if (!gesture) return;
    const wasFrame = gesture.kind === "frame";
    setGesture(null);
    if (wasFrame && view && stage) {
      animateTo(refit(view, stage));
    }
  };

  const handleWheel = (event: React.WheelEvent) => {
    if (!view || !image || saving) return;
    const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015));
    setView(zoomAround(view, factor, localPoint(event), image));
  };

  // ---- 角度拨盘 ----
  const dialRef = useRef<HTMLDivElement>(null);
  const dialBaseRef = useRef<CropViewState | null>(null);
  const straightenFromPointer = (event: { clientX: number }) => {
    const rect = dialRef.current!.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width - 0.5;
    const value = Math.max(-MAX_STRAIGHTEN, Math.min(MAX_STRAIGHTEN, ratio * 2 * MAX_STRAIGHTEN));
    return Math.round(value * 2) / 2;
  };
  const applyStraighten = (value: number, base = dialBaseRef.current ?? view) => {
    if (!base || !image) return;
    // 每次都从拖动开始时的画面算起，拖动中来回也不会让平移漂移
    setView(setStraighten(base, value, image));
  };

  // ---- 离散操作 ----
  const chooseAspect = (key: AspectKey) => {
    if (!view || !image || !stage) return;
    setAspectKey(key);
    const preset = ASPECTS.find(item => item.key === key);
    const aspect =
      key === "free"
        ? null
        : key === "original"
          ? naturalAspect(image, view.quarterTurns)
          : preset!.value!;
    animateTo(applyAspect(view, aspect, image, stage));
  };

  const rotate = () => {
    if (!view || !image || !stage) return;
    const next = rotateQuarter(view, stage);
    if (aspectKey === "original") next.aspect = naturalAspect(image, next.quarterTurns);
    animateTo(ensureCover(next, image));
  };

  const flip = () => view && animateTo(flipHorizontal(view));

  const reset = () => {
    if (!image || !stage) return;
    setAspectKey("free");
    animateTo(fromTransform(identityTransform(image), stage));
  };

  const confirm = async () => {
    if (!view || !imageRef.current || saving) return;
    setSaving(true);
    setError("");
    const transform = toTransform(view);
    const { mime, ext } = outputFormatOf(originalUrl);
    let blob: Blob;
    try {
      blob = await exportCrop(imageRef.current, transform, mime);
    } catch (cause) {
      console.error("裁剪导出失败:", cause);
      setError("裁剪结果导出失败：图片来源不允许读取像素");
      setSaving(false);
      return;
    }
    // 保存失败（如上传出错）时留在编辑器里，可直接重试
    try {
      await onConfirm({ transform, blob, ext });
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      void confirm();
    }
  };

  const rotation = view ? rotationOf(view) : 0;
  const transition =
    animating && "transition-[left,top,width,height,transform] duration-200 ease-tau-out";
  const outputSize = view ? toTransform(view) : null;

  return createPortal(
    <div
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="裁剪与旋转"
      className="fixed inset-0 z-[1100] flex select-none flex-col bg-[#111113] text-white outline-none"
      onKeyDown={handleKeyDown}
    >
      {/* 顶栏 */}
      <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center px-4 py-3">
        <div>
          <button
            type="button"
            onClick={onCancel}
            className="text-tau-body rounded-tau-sm h-8 px-3 text-white/75 transition-colors hover:bg-white/10 hover:text-white"
          >
            取消
          </button>
        </div>
        <div className="text-tau-body text-white/75">
          {error ? (
            <span className="flex items-center gap-1.5">
              <CircleAlert size={15} />
              {error}
            </span>
          ) : (
            "裁剪与旋转"
          )}
        </div>
        <div className="flex justify-end">
          <Button
            variant="primary"
            size="sm"
            icon={Check}
            loading={saving}
            onClick={() => void confirm()}
          >
            完成
          </Button>
        </div>
      </div>

      {/* 舞台 */}
      <div
        ref={stageRef}
        className={cn(
          "relative min-h-0 flex-1 overflow-hidden",
          gesture?.kind === "pan" ? "cursor-grabbing" : "cursor-grab"
        )}
        onPointerDown={event => startGesture(event)}
        onPointerMove={moveGesture}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onWheel={handleWheel}
      >
        {view && image && (
          <>
            <img
              src={imageSrc}
              alt=""
              draggable={false}
              className={cn("pointer-events-none absolute max-w-none", transition)}
              style={{
                left: view.center.x - (image.width * view.scale) / 2,
                top: view.center.y - (image.height * view.scale) / 2,
                width: image.width * view.scale,
                height: image.height * view.scale,
                transform: `rotate(${rotation}rad) scaleX(${view.flipX ? -1 : 1})`,
              }}
            />
            <div
              className={cn(
                "absolute shadow-[0_0_0_9999px_rgba(0,0,0,0.58)] outline outline-1 outline-white/90",
                transition
              )}
              style={{
                left: view.frame.x,
                top: view.frame.y,
                width: view.frame.width,
                height: view.frame.height,
              }}
            >
              {gesture && <Thirds />}
              {HANDLES.map(({ handle, className, cursor }) => (
                <span
                  key={handle}
                  className={cn(
                    "absolute touch-none border-white",
                    handle.length === 1 && "bg-white",
                    className
                  )}
                  style={{ cursor }}
                  onPointerDown={event => startGesture(event, handle)}
                />
              ))}
              {outputSize && (
                <span className="font-tau-mono text-tau-micro pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-[6px] bg-black/65 px-2 py-0.5 tabular-nums">
                  {Math.round(outputSize.cropWidth)} × {Math.round(outputSize.cropHeight)}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* 底部：角度拨盘 + 比例 / 旋转 / 翻转 / 还原 */}
      <div className="flex shrink-0 flex-col items-center gap-3 px-4 pb-5 pt-3">
        <div
          ref={dialRef}
          role="slider"
          aria-label="微调角度"
          aria-valuemin={-MAX_STRAIGHTEN}
          aria-valuemax={MAX_STRAIGHTEN}
          aria-valuenow={view?.straighten ?? 0}
          title="拖动微调角度，双击归零"
          className="relative h-10 w-[min(520px,80%)] cursor-ew-resize touch-none"
          onPointerDown={event => {
            if (!view) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            dialBaseRef.current = view;
            applyStraighten(straightenFromPointer(event), view);
          }}
          onPointerMove={event => {
            if (dialBaseRef.current) applyStraighten(straightenFromPointer(event));
          }}
          onPointerUp={() => (dialBaseRef.current = null)}
          onDoubleClick={() => view && image && animateTo(setStraighten(view, 0, image))}
        >
          <span className="font-tau-mono text-tau-sm absolute -top-1 left-1/2 -translate-x-1/2 tabular-nums">
            {(view?.straighten ?? 0) > 0 ? "+" : ""}
            {(view?.straighten ?? 0).toFixed(1)}°
          </span>
          <span className="absolute inset-x-0 bottom-1 top-5 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.35)_0_1px,transparent_1px_10px)] [mask-image:linear-gradient(90deg,transparent,#000_20%,#000_80%,transparent)]" />
          <span className="absolute bottom-1 left-1/2 h-4 w-0.5 -translate-x-1/2 bg-white/70" />
          <span
            className="bg-accent absolute bottom-0 h-6 w-0.5 -translate-x-1/2 rounded-full"
            style={{ left: `${50 + ((view?.straighten ?? 0) / MAX_STRAIGHTEN) * 50}%` }}
          />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <div className="flex gap-0.5">
            {ASPECTS.map(item => (
              <button
                key={item.key}
                type="button"
                onClick={() => chooseAspect(item.key)}
                className={cn(
                  "text-tau-meta rounded-tau-sm h-7 px-2.5 transition-colors",
                  aspectKey === item.key
                    ? "bg-white/15 text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <span className="h-4 w-px bg-white/15" />
          <button
            type="button"
            title="向左旋转 90°"
            onClick={rotate}
            className="rounded-tau-sm grid size-8 place-items-center text-white/75 hover:bg-white/10 hover:text-white"
          >
            <RotateCcw size={16} />
          </button>
          <button
            type="button"
            title="水平翻转"
            onClick={flip}
            className="rounded-tau-sm grid size-8 place-items-center text-white/75 hover:bg-white/10 hover:text-white"
          >
            <FlipHorizontal2 size={16} />
          </button>
          <span className="h-4 w-px bg-white/15" />
          <button
            type="button"
            onClick={reset}
            className="text-tau-meta rounded-tau-sm h-7 px-2.5 text-white/70 hover:bg-white/10 hover:text-white"
          >
            还原
          </button>
        </div>
      </div>
    </div>,
    portalContainer
  );
};

export default ImageCropEditor;
