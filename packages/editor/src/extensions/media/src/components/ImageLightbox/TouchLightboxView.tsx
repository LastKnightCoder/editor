import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn, lockBodyScroll, usePortalContainer } from "@tau/ui";
import { Copy, X } from "lucide-react";

import { panAroundAnchor, pointFromCenter, useNotifier } from "@tau/editor/api";
import { useEditorSlots } from "../../services/hooks";
import type { useImageLightboxStore } from "../../stores";
import { copyImageElement } from "../../utils/imageBlob";

type Point = { x: number; y: number };

type TouchLightboxViewProps = Pick<
  ReturnType<typeof useImageLightboxStore.getState>,
  "items" | "index" | "setIndex" | "close"
>;

const MAX_ZOOM = 5;
const DOUBLE_TAP_ZOOM = 2;
/** 两次点按间隔不超过它算双击；单击要等它过去才切换界面 */
const DOUBLE_TAP_MS = 280;
/** 位移超过它才判定手势方向 */
const DIRECTION_SLOP = 8;
/** 左右滑超过舞台宽度的这个比例就切图 */
const SWIPE_COMMIT_RATIO = 0.18;
/** 下滑超过它松手即关闭 */
const DISMISS_DISTANCE = 110;
/** 相邻图片之间的间隙 */
const SLIDE_GAP = 16;
const SETTLE_MS = 220;

type Gesture =
  | { kind: "undecided" | "swipe" | "dismiss"; start: Point }
  | { kind: "pan"; start: Point; startPan: Point; moved: boolean }
  | { kind: "pinch"; startDistance: number; startMid: Point; startZoom: number; startPan: Point };

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(1, zoom));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * 触屏灯箱：沉浸黑底，手势照系统相册——单击切换界面、双击 1× / 2×、双指捏合缩放、放大后拖动平移，
 * 未放大时左右滑切图、下滑关闭（跟手缩小、背景渐隐）。底部为说明与复制。
 */
const TouchLightboxView = ({ items, index, setIndex, close }: TouchLightboxViewProps) => {
  useEffect(() => lockBodyScroll(document), []);
  const portalContainer = usePortalContainer();
  const { Image } = useEditorSlots();
  const notifier = useNotifier();
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const [zoom, setZoomState] = useState(1);
  const zoomRef = useRef(1);
  const setZoom = (value: number) => {
    zoomRef.current = value;
    setZoomState(value);
  };
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [swipeX, setSwipeXState] = useState(0);
  const [dismissY, setDismissYState] = useState(0);
  // 松手时按最新位移判定（同一帧内的移动尚未重渲染）
  const swipeXRef = useRef(0);
  const dismissYRef = useRef(0);
  const setSwipeX = (value: number) => {
    swipeXRef.current = value;
    setSwipeXState(value);
  };
  const setDismissY = (value: number) => {
    dismissYRef.current = value;
    setDismissYState(value);
  };
  const [settling, setSettling] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);

  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<Gesture | null>(null);
  const lastTapRef = useRef<{ time: number; point: Point } | null>(null);
  const tapTimerRef = useRef<number | undefined>(undefined);
  const settleTimerRef = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      window.clearTimeout(tapTimerRef.current);
      window.clearTimeout(settleTimerRef.current);
    },
    []
  );

  const item = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [index]);

  const stageSize = () => {
    const rect = stageRef.current?.getBoundingClientRect();
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
  };

  /** 平移不让图片边缘离开舞台（图片小于舞台的方向不可平移） */
  const clampPan = (next: Point, atZoom: number): Point => {
    const img = imageRef.current;
    const stage = stageSize();
    if (!img) return next;
    const maxX = Math.max(0, (img.offsetWidth * atZoom - stage.width) / 2);
    const maxY = Math.max(0, (img.offsetHeight * atZoom - stage.height) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  };

  const settle = (apply: () => void, after?: () => void) => {
    setSettling(true);
    apply();
    window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      setSettling(false);
      after?.();
    }, SETTLE_MS);
  };

  const zoomTo = (nextZoom: number, anchor: Point) => {
    const target = clampZoom(nextZoom);
    settle(() => {
      setZoom(target);
      setPan(
        target <= 1 ? { x: 0, y: 0 } : clampPan(panAroundAnchor(pan, zoom, target, anchor), target)
      );
    });
  };

  const go = (direction: 1 | -1) => {
    const { width } = stageSize();
    settle(
      () => setSwipeX(-direction * (width + SLIDE_GAP)),
      () => {
        setSwipeX(0);
        setIndex(index + direction);
      }
    );
  };

  const handleTap = (point: Point) => {
    const now = performance.now();
    const last = lastTapRef.current;
    if (last && now - last.time < DOUBLE_TAP_MS && distance(last.point, point) < 30) {
      lastTapRef.current = null;
      window.clearTimeout(tapTimerRef.current);
      zoomTo(zoom > 1 ? 1 : DOUBLE_TAP_ZOOM, point);
      return;
    }
    lastTapRef.current = { time: now, point };
    window.clearTimeout(tapTimerRef.current);
    tapTimerRef.current = window.setTimeout(
      () => setChromeVisible(visible => !visible),
      DOUBLE_TAP_MS
    );
  };

  const localPoint = (event: { clientX: number; clientY: number }) =>
    stageRef.current ? pointFromCenter(stageRef.current, event) : { x: 0, y: 0 };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (settling) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = localPoint(event);
    pointersRef.current.set(event.pointerId, point);
    const pointers = [...pointersRef.current.values()];
    if (pointers.length >= 2) {
      setSwipeX(0);
      setDismissY(0);
      gestureRef.current = {
        kind: "pinch",
        startDistance: distance(pointers[0], pointers[1]) || 1,
        startMid: midpoint(pointers[0], pointers[1]),
        startZoom: zoom,
        startPan: pan,
      };
      return;
    }
    gestureRef.current =
      zoom > 1
        ? { kind: "pan", start: point, startPan: pan, moved: false }
        : { kind: "undecided", start: point };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    const point = localPoint(event);
    pointersRef.current.set(event.pointerId, point);
    const gesture = gestureRef.current;
    if (!gesture) return;

    if (gesture.kind === "pinch") {
      const pointers = [...pointersRef.current.values()];
      if (pointers.length < 2) return;
      const mid = midpoint(pointers[0], pointers[1]);
      const nextZoom = clampZoom(
        (gesture.startZoom * distance(pointers[0], pointers[1])) / gesture.startDistance
      );
      const anchored = panAroundAnchor(
        gesture.startPan,
        gesture.startZoom,
        nextZoom,
        gesture.startMid
      );
      setZoom(nextZoom);
      setPan(
        clampPan(
          {
            x: anchored.x + mid.x - gesture.startMid.x,
            y: anchored.y + mid.y - gesture.startMid.y,
          },
          nextZoom
        )
      );
      return;
    }

    const dx = point.x - gesture.start.x;
    const dy = point.y - gesture.start.y;
    if (gesture.kind === "pan") {
      if (Math.abs(dx) > DIRECTION_SLOP || Math.abs(dy) > DIRECTION_SLOP) gesture.moved = true;
      setPan(clampPan({ x: gesture.startPan.x + dx, y: gesture.startPan.y + dy }, zoom));
      return;
    }
    if (gesture.kind === "undecided") {
      if (Math.abs(dx) < DIRECTION_SLOP && Math.abs(dy) < DIRECTION_SLOP) return;
      gestureRef.current = {
        kind: Math.abs(dx) >= Math.abs(dy) ? "swipe" : "dismiss",
        start: gesture.start,
      };
      return;
    }
    if (gesture.kind === "swipe") {
      // 首尾张继续拖有阻尼，提示没有更多
      const blocked = (dx > 0 && !hasPrev) || (dx < 0 && !hasNext);
      setSwipeX(blocked ? dx * 0.35 : dx);
    } else {
      setDismissY(Math.max(0, dy));
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = pointersRef.current.get(event.pointerId) ?? localPoint(event);
    pointersRef.current.delete(event.pointerId);
    const gesture = gestureRef.current;
    if (!gesture) return;
    if (gesture.kind === "pinch") {
      if (pointersRef.current.size > 0) return;
      gestureRef.current = null;
      if (zoomRef.current <= 1.02) {
        settle(() => {
          setZoom(1);
          setPan({ x: 0, y: 0 });
        });
      }
      return;
    }
    gestureRef.current = null;
    if (gesture.kind === "pan") {
      if (!gesture.moved) handleTap(point);
      return;
    }
    if (gesture.kind === "undecided") {
      handleTap(point);
      return;
    }
    if (gesture.kind === "swipe") {
      const threshold = stageSize().width * SWIPE_COMMIT_RATIO;
      const offset = swipeXRef.current;
      if (offset <= -threshold && hasNext) go(1);
      else if (offset >= threshold && hasPrev) go(-1);
      else settle(() => setSwipeX(0));
      return;
    }
    if (dismissYRef.current > DISMISS_DISTANCE) close();
    else settle(() => setDismissY(0));
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    gestureRef.current = null;
    settle(() => {
      setSwipeX(0);
      setDismissY(0);
    });
  };

  const copyImage = async () => {
    const ok = imageRef.current ? await copyImageElement(imageRef.current) : false;
    if (ok) notifier.success("图片已复制");
    else notifier.error("复制失败：图片来源不允许读取");
  };

  const dismissProgress = Math.min(1, dismissY / 400);
  const transition = settling ? "ease-tau-out transition-transform duration-200" : "";
  const chromeClass = cn(
    "transition-opacity duration-200",
    chromeVisible && dismissY === 0 ? "opacity-100" : "pointer-events-none opacity-0"
  );
  const slides = [index - 1, index, index + 1].filter(slot => slot >= 0 && slot < items.length);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      data-touch-lightbox="true"
      className="fixed inset-0 z-[1100] flex select-none flex-col text-white"
    >
      {/* 背景单独一层，下滑时渐隐露出文档（看图场景固定深色，不随主题） */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[#0c0c0d]"
        style={{ opacity: 1 - dismissProgress * 0.85 }}
      />

      <div
        className={cn(
          "relative z-[1] flex shrink-0 items-center gap-1 px-2 pb-1 pt-[max(env(safe-area-inset-top),8px)]",
          chromeClass
        )}
      >
        <button
          type="button"
          aria-label="关闭"
          className="grid size-10 place-items-center rounded-full text-white"
          onClick={close}
        >
          <X size={20} />
        </button>
        <span className="text-tau-body flex-1 text-center font-semibold tabular-nums">
          {items.length > 1 ? `${index + 1} / ${items.length}` : ""}
        </span>
        <span className="size-10" />
      </div>

      <div
        ref={stageRef}
        data-lightbox-stage="true"
        className="relative z-[1] min-h-0 flex-1 touch-none overflow-hidden"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div
          className={cn("absolute inset-0", transition)}
          style={{ transform: `translateX(${swipeX}px)` }}
        >
          {slides.map(slot => {
            const current = slot === index;
            const offset = slot - index;
            return (
              <div
                key={`${slot}-${items[slot].url}`}
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
                style={{
                  transform: `translateX(calc(${offset * 100}% + ${offset * SLIDE_GAP}px))`,
                }}
              >
                <Image
                  ref={current ? imageRef : undefined}
                  url={items[slot].url}
                  alt={items[slot].alt}
                  crossOrigin="anonymous"
                  draggable={false}
                  className={cn(
                    "max-h-full max-w-full select-none object-contain",
                    current && transition
                  )}
                  style={
                    current
                      ? {
                          transform: `translate(${pan.x}px, ${pan.y + dismissY}px) scale(${
                            zoom * (1 - dismissProgress * 0.3)
                          })`,
                        }
                      : undefined
                  }
                />
              </div>
            );
          })}
        </div>
      </div>

      <div
        className={cn(
          "relative z-[1] flex shrink-0 flex-col items-center gap-2 px-6 pb-[max(env(safe-area-inset-bottom),12px)] pt-2",
          chromeClass
        )}
      >
        {item.caption ? (
          <div className="text-tau-body max-h-16 overflow-y-auto text-center leading-relaxed text-white/90">
            {item.caption}
          </div>
        ) : null}
        <button
          type="button"
          className="text-tau-sm flex h-12 w-16 flex-col items-center justify-center gap-1 text-white"
          onClick={() => void copyImage()}
        >
          <Copy size={20} />
          复制
        </button>
      </div>
    </div>,
    portalContainer
  );
};

export default TouchLightboxView;
