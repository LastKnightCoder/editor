/**
 * 首页面板容器（D-182）：按布局渲染面板，一个可换行的流式容器——wide 占整行，compact 约 340px
 * 起并可伸展，排不满的行伸展填满，同行等高。没有内容的面板（组件返回 null，插件面板正文为空）不占位。
 *
 * 编辑模式：面板内容保持原样但不可点，右上角出现把手与隐藏按钮；按住面板任意位置拖起——面板浮起
 * 跟手（整行面板缩成预览宽度），原位留下虚线空位，其余面板实时让位（motion 布局动画），松手后
 * 浮起的卡片落回空位。拖进末尾「已隐藏」区即隐藏，隐藏区的面板点一下恢复到末尾、拖回任意位置。
 * 指针靠近滚动区上下边缘自动滚动，Esc 取消（卡片飞回原处）；把手获得焦点时方向键移动。
 * 拖动用指针事件实现，不走 HTML 拖放 API（Electron 里原生拖放会话可能起不来，连 dragend 都不来）。
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { motion, type Transition } from "motion/react";
import { EyeOff, GripVertical, Plus } from "lucide-react";
import { cn } from "@tau/ui";
import type { HomeLayoutEntry } from "@/types/home-layout";
import {
  arrangePanels,
  mergeLayout,
  movePanel,
  setPanelHidden,
  type HomePanelDefinition,
} from "../layout";

/** 首页纸内的滚动容器：懒加载的面板以它为可见性根 */
export const HomeScrollRootContext = createContext<HTMLElement | null>(null);

const ICON = "size-[15px]";
const CHROME_BUTTON =
  "text-ink-2 hover:bg-hover hover:text-ink-1 grid size-7 place-items-center rounded-[7px]";
const LAYOUT_TRANSITION: Transition = { duration: 0.24, ease: [0.22, 1, 0.36, 1] };
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
/** 移动超过这个距离才算拖动，避免点击被当成拖拽 */
const DRAG_THRESHOLD = 4;
/** 让位后指针再移动这么远才允许下一次让位，避免在换行处来回抖 */
const SWAP_HYSTERESIS = 10;
/** 指针离滚动区上下边缘这么近时自动滚动，越近越快 */
const AUTO_SCROLL_EDGE = 56;
const AUTO_SCROLL_MAX = 14;
/** 宽于这个值的面板浮起时缩到 WIDE_GHOST_WIDTH，不挡住整屏 */
const WIDE_GHOST_LIMIT = 620;
const WIDE_GHOST_WIDTH = 560;

type Where = "before" | "after";
type Hit =
  | { kind: "panel"; id: string; before: boolean }
  | { kind: "end" }
  | { kind: "hidden" }
  | { kind: "none" };

interface DragSession {
  id: string;
  source: "panel" | "tray";
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
  /** 拖动开始时的显示顺序：没动过就不保存 */
  base: string[];
  ghost: HTMLElement | null;
  offsetX: number;
  offsetY: number;
  scale: number;
  liftScale: number;
  tilt: number;
  tiltTarget: number;
  lastX: number;
  swapX: number;
  swapY: number;
  frame: number;
  landing: boolean;
  detach(): void;
}

export function HomePanels({
  panels,
  layout,
  editing = false,
  onChange,
}: {
  panels: readonly HomePanelDefinition[];
  layout: readonly HomeLayoutEntry[];
  editing?: boolean;
  onChange(next: HomeLayoutEntry[]): void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hiddenZoneRef = useRef<HTMLDivElement>(null);
  const scrollRoot = useContext(HomeScrollRootContext);
  const [dragId, setDragId] = useState<string | null>(null);
  // 拖动中的显示顺序（实时让位）；拖进隐藏区时不含被拖的面板
  const [preview, setPreview] = useState<string[] | null>(null);
  const [overHidden, setOverHidden] = useState(false);
  const previewRef = useRef<string[] | null>(null);
  const overHiddenRef = useRef(false);
  const sessionRef = useRef<DragSession | null>(null);
  // 拖动松手后紧跟的 click 不算点击（隐藏区的按钮点一下即恢复）
  const draggedRef = useRef(false);
  // 键盘移动后把焦点还给同一块面板的把手（重排会让焦点丢失）
  const [focusId, setFocusId] = useState<string | null>(null);
  const { shown, hidden } = arrangePanels(panels, layout);
  const byId = new Map(panels.map(panel => [panel.id, panel]));
  const displayed = preview ? preview.flatMap(id => byId.get(id) ?? []) : shown;
  const trayPanels = hidden.filter(panel => !preview?.includes(panel.id));

  useEffect(() => {
    if (!focusId) return;
    containerRef.current
      ?.querySelector<HTMLElement>(`[data-home-panel="${focusId}"] [data-home-panel-handle]`)
      ?.focus();
    setFocusId(null);
  }, [focusId, layout]);

  const full = () =>
    mergeLayout(
      panels.map(panel => panel.id),
      layout
    );
  const place = (id: string, target: string, where: Where) =>
    onChange(setPanelHidden(movePanel(full(), id, target, where), id, false));
  const hide = (id: string) => onChange(setPanelHidden(full(), id, true));
  const restore = (id: string) => {
    const last = shown.at(-1);
    if (last) place(id, last.id, "after");
    else onChange(setPanelHidden(full(), id, false));
  };
  // 拖动的监听在按下时绑定，松手时要用最新一次渲染的布局
  const actionsRef = useRef({ place, hide, full, onChange });
  actionsRef.current = { place, hide, full, onChange };

  const updatePreview = (next: string[] | null) => {
    previewRef.current = next;
    setPreview(next);
  };
  const updateOverHidden = (next: boolean) => {
    overHiddenRef.current = next;
    setOverHidden(next);
  };

  const resetDrag = () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) {
      session.detach();
      cancelAnimationFrame(session.frame);
      session.ghost?.remove();
    }
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    setDragId(null);
    updatePreview(null);
    updateOverHidden(false);
  };

  // 退出编辑模式时丢弃进行中的拖动，不留浮起的卡片与空位
  const resetDragRef = useRef(resetDrag);
  resetDragRef.current = resetDrag;
  useEffect(() => {
    if (!editing && sessionRef.current) resetDragRef.current();
  }, [editing]);
  useEffect(
    () => () => {
      const session = sessionRef.current;
      if (!session) return;
      session.detach();
      session.ghost?.remove();
    },
    []
  );

  /** 用布局位置（offset*）命中，不受让位动画中的 transform 影响 */
  const hitTest = (x: number, y: number): Hit => {
    // 隐藏区在最后：它上缘以下都算拖进隐藏区（让位会让隐藏区上下移动，不必追着它对准）
    const zone = hiddenZoneRef.current?.getBoundingClientRect();
    if (zone && x >= zone.left - 12 && x <= zone.right + 12 && y >= zone.top - 8)
      return { kind: "hidden" };
    const container = containerRef.current;
    if (!container) return { kind: "none" };
    const box = container.getBoundingClientRect();
    if (x < box.left - 12 || x > box.right + 12) return { kind: "none" };
    const localX = x - box.left;
    const localY = y - box.top;
    let bottom = 0;
    for (const el of container.querySelectorAll<HTMLElement>(":scope > [data-home-panel]")) {
      const { offsetLeft: left, offsetTop: top, offsetWidth: width, offsetHeight: height } = el;
      if (!width || !height) continue;
      bottom = Math.max(bottom, top + height);
      if (localX < left || localX > left + width || localY < top || localY > top + height) continue;
      const before =
        el.dataset.homePanelSize === "compact"
          ? localX < left + width / 2
          : localY < top + height / 2;
      return { kind: "panel", id: el.dataset.homePanel ?? "", before };
    }
    return localY > bottom ? { kind: "end" } : { kind: "none" };
  };

  const retarget = (session: DragSession) => {
    const current = previewRef.current ?? session.base;
    const hit = hitTest(session.x, session.y);
    if (hit.kind === "hidden") {
      if (overHiddenRef.current) return;
      updateOverHidden(true);
      updatePreview(current.filter(id => id !== session.id));
      return;
    }
    if (overHiddenRef.current) updateOverHidden(false);
    if (hit.kind === "none" || (hit.kind === "panel" && hit.id === session.id)) return;
    const placed = current.includes(session.id);
    if (
      placed &&
      Math.hypot(session.x - session.swapX, session.y - session.swapY) < SWAP_HYSTERESIS
    )
      return;
    const rest = current.filter(id => id !== session.id);
    const target = hit.kind === "panel" ? rest.indexOf(hit.id) : rest.length;
    if (target < 0) return;
    const index = hit.kind === "panel" && !hit.before ? target + 1 : target;
    const next = [...rest.slice(0, index), session.id, ...rest.slice(index)];
    if (placed && next.every((id, i) => id === current[i])) return;
    session.swapX = session.x;
    session.swapY = session.y;
    updatePreview(next);
  };

  const paintGhost = (session: DragSession) => {
    if (!session.ghost) return;
    session.ghost.style.transform = `translate(${session.x - session.offsetX}px, ${
      session.y - session.offsetY
    }px) rotate(${session.tilt.toFixed(2)}deg) scale(${session.scale.toFixed(4)})`;
  };

  const tick = (session: DragSession) => {
    if (sessionRef.current !== session || session.landing) return;
    // 浮起时缓慢放大到位；横向移动带一点倾斜，停下后回正
    session.scale += (session.liftScale - session.scale) * 0.3;
    session.tilt += (session.tiltTarget - session.tilt) * 0.2;
    session.tiltTarget *= 0.85;
    if (scrollRoot) {
      const rect = scrollRoot.getBoundingClientRect();
      const depth =
        session.y < rect.top + AUTO_SCROLL_EDGE
          ? session.y - (rect.top + AUTO_SCROLL_EDGE)
          : session.y > rect.bottom - AUTO_SCROLL_EDGE
            ? session.y - (rect.bottom - AUTO_SCROLL_EDGE)
            : 0;
      if (depth) {
        const before = scrollRoot.scrollTop;
        scrollRoot.scrollTop += Math.round(
          Math.max(-1, Math.min(1, depth / AUTO_SCROLL_EDGE)) * AUTO_SCROLL_MAX
        );
        if (scrollRoot.scrollTop !== before) retarget(session);
      }
    }
    paintGhost(session);
    session.frame = requestAnimationFrame(() => tick(session));
  };

  const liftGhost = (session: DragSession, source: HTMLElement) => {
    const rect = source.getBoundingClientRect();
    const ghost = document.createElement("div");
    ghost.setAttribute("aria-hidden", "true");
    if (session.source === "panel") {
      const clone = source.cloneNode(true) as HTMLElement;
      clone.removeAttribute("data-home-panel");
      clone.querySelectorAll("[data-home-panel-chrome]").forEach(el => el.remove());
      clone.removeAttribute("style");
      clone.className = "group/home-panel flex size-full flex-col";
      ghost.append(clone);
      ghost.className =
        "rounded-tau-lg bg-surface shadow-float pointer-events-none fixed left-0 top-0 z-50 overflow-hidden";
      ghost.style.width = `${rect.width}px`;
      ghost.style.height = `${rect.height}px`;
      session.liftScale = rect.width > WIDE_GHOST_LIMIT ? WIDE_GHOST_WIDTH / rect.width : 1.02;
    } else {
      const panel = byId.get(session.id);
      ghost.textContent = `${panel?.title ?? ""} · ${panel?.size === "wide" ? "整行" : "紧凑"}`;
      ghost.className =
        "border-line-1 bg-surface shadow-float text-tau-meta text-ink-1 pointer-events-none fixed left-0 top-0 z-50 whitespace-nowrap rounded-[9px] border px-3 py-1.5 font-medium";
      session.liftScale = 1;
    }
    session.offsetX = session.startX - rect.left;
    session.offsetY = session.startY - rect.top;
    ghost.style.transformOrigin = `${session.offsetX}px ${session.offsetY}px`;
    (containerRef.current?.closest(".app") ?? document.body).append(ghost);
    session.ghost = ghost;
    paintGhost(session);
  };

  /** 浮起的卡片落到 target 的布局位置，或原地淡出；结束后清掉拖动状态 */
  const landGhost = (session: DragSession, target: HTMLElement | null) => {
    session.landing = true;
    cancelAnimationFrame(session.frame);
    const ghost = session.ghost;
    const container = containerRef.current;
    const finish = () => {
      if (sessionRef.current === session) resetDrag();
    };
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!ghost || reduced || typeof ghost.animate !== "function") return finish();
    const s = session.scale;
    const tilt = `rotate(${session.tilt.toFixed(2)}deg)`;
    // 变换原点挪到左上角，起点按当前缩放等价换算，落点直接对齐空位左上角
    ghost.style.transformOrigin = "0 0";
    const from: Keyframe = {
      transform: `translate(${session.x - session.offsetX * s}px, ${
        session.y - session.offsetY * s
      }px) ${tilt} scale(${s.toFixed(4)})`,
      width: ghost.style.width,
      opacity: 1,
    };
    let to: Keyframe;
    if (target && container) {
      const box = container.getBoundingClientRect();
      to = {
        transform: `translate(${box.left + target.offsetLeft}px, ${
          box.top + target.offsetTop
        }px) rotate(0deg) scale(1)`,
        width: `${target.offsetWidth}px`,
        opacity: 1,
      };
    } else {
      to = { ...from, transform: `${from.transform} scale(0.92)`, opacity: 0 };
    }
    ghost
      .animate([from, to], { duration: target ? 240 : 160, easing: EASE, fill: "forwards" })
      .finished.then(finish, finish);
  };

  const slotOf = (id: string) =>
    containerRef.current?.querySelector<HTMLElement>(`:scope > [data-home-panel="${id}"]`) ?? null;

  const cancel = (session: DragSession) => {
    session.landing = true;
    cancelAnimationFrame(session.frame);
    updatePreview(null);
    updateOverHidden(false);
    // 等原顺序渲染出来再量落点
    requestAnimationFrame(() =>
      landGhost(session, session.source === "panel" ? slotOf(session.id) : null)
    );
  };

  const drop = (session: DragSession) => {
    const order = previewRef.current;
    const { place, hide, full, onChange } = actionsRef.current;
    if (overHiddenRef.current) {
      if (session.source === "panel") hide(session.id);
      updateOverHidden(false);
      return landGhost(session, null);
    }
    if (!order?.includes(session.id)) return cancel(session);
    const index = order.indexOf(session.id);
    const unchanged =
      order.length === session.base.length && order.every((id, i) => id === session.base[i]);
    if (!unchanged) {
      if (index > 0) place(session.id, order[index - 1], "after");
      else if (order.length > 1) place(session.id, order[1], "before");
      else onChange(setPanelHidden(full(), session.id, false));
    }
    landGhost(session, session.source === "panel" ? slotOf(session.id) : null);
  };

  const startDrag =
    (id: string, source: DragSession["source"]) => (e: PointerEvent<HTMLElement>) => {
      if (!editing || e.button !== 0 || sessionRef.current) return;
      if ((e.target as Element).closest("[data-home-panel-action]")) return;
      const sourceEl = e.currentTarget;
      draggedRef.current = false;
      const move = (next: globalThis.PointerEvent) => {
        if (next.pointerId !== session.pointerId || session.landing) return;
        session.x = next.clientX;
        session.y = next.clientY;
        if (!session.moved) {
          if (Math.hypot(session.x - session.startX, session.y - session.startY) < DRAG_THRESHOLD)
            return;
          session.moved = true;
          document.body.style.cursor = "grabbing";
          document.body.style.userSelect = "none";
          liftGhost(session, sourceEl);
          setDragId(session.id);
          updatePreview(session.base);
          session.frame = requestAnimationFrame(() => tick(session));
        }
        session.tiltTarget = Math.max(-4, Math.min(4, (session.x - session.lastX) * 0.45));
        session.lastX = session.x;
        paintGhost(session);
        retarget(session);
      };
      const end = (next: globalThis.PointerEvent) => {
        if (next.pointerId !== session.pointerId) return;
        session.detach();
        if (!session.moved) {
          sessionRef.current = null;
          return;
        }
        if (session.landing) return;
        draggedRef.current = true;
        if (next.type === "pointerup") drop(session);
        else cancel(session);
      };
      const cancelByKey = (next: globalThis.KeyboardEvent) => {
        if (next.key !== "Escape" || !session.moved || session.landing) return;
        next.preventDefault();
        next.stopPropagation();
        session.detach();
        cancel(session);
      };
      const session: DragSession = {
        id,
        source,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        x: e.clientX,
        y: e.clientY,
        moved: false,
        base: shown.map(panel => panel.id),
        ghost: null,
        offsetX: 0,
        offsetY: 0,
        scale: 1,
        liftScale: 1,
        tilt: 0,
        tiltTarget: 0,
        lastX: e.clientX,
        swapX: e.clientX,
        swapY: e.clientY,
        frame: 0,
        landing: false,
        detach: () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", end);
          window.removeEventListener("pointercancel", end);
          document.removeEventListener("keydown", cancelByKey, true);
        },
      };
      sessionRef.current = session;
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
      document.addEventListener("keydown", cancelByKey, true);
    };

  const moveByKey = (index: number) => (e: KeyboardEvent) => {
    const step =
      e.key === "ArrowUp" || e.key === "ArrowLeft"
        ? -1
        : e.key === "ArrowDown" || e.key === "ArrowRight"
          ? 1
          : 0;
    const target = step ? shown[index + step] : undefined;
    if (!target) return;
    e.preventDefault();
    const id = shown[index].id;
    place(id, target.id, step < 0 ? "before" : "after");
    setFocusId(id);
  };

  const dragging = dragId !== null;
  const pendingHide = overHidden && dragId ? byId.get(dragId) : undefined;

  return (
    <>
      <div ref={containerRef} className="relative flex flex-wrap gap-3">
        {displayed.map((panel, index) => {
          const Component = panel.component;
          const isSlot = dragId === panel.id;
          return (
            <motion.div
              key={panel.id}
              layout={editing ? "position" : false}
              transition={LAYOUT_TRANSITION}
              data-home-panel={panel.id}
              data-home-panel-size={panel.size}
              data-home-panel-slot={isSlot || undefined}
              onPointerDown={editing ? startDrag(panel.id, "panel") : undefined}
              className={cn(
                "group/home-panel rounded-tau-lg relative flex min-w-0 flex-col",
                panel.size === "wide" ? "basis-full" : "min-w-[min(340px,100%)] flex-[1_1_340px]",
                editing
                  ? cn(
                      "select-none",
                      dragging
                        ? "cursor-grabbing"
                        : "hover:shadow-lift ease-tau-out cursor-grab transition-[box-shadow,translate] duration-[160ms] hover:-translate-y-px"
                    )
                  : "has-[>[data-home-panel-content]:empty]:hidden has-[[data-home-panel-body]:empty]:hidden"
              )}
            >
              <div
                data-home-panel-content
                inert={editing || undefined}
                className={cn(
                  "flex min-w-0 flex-1 flex-col empty:hidden [&>*]:flex-1",
                  editing && "group-has-[[data-home-panel-body]:empty]/home-panel:hidden",
                  isSlot && "invisible"
                )}
              >
                <Component />
              </div>
              {editing && (
                <>
                  {/* 没有内容的面板在编辑模式里显示为占位卡，照样可以排位置 */}
                  <div
                    data-home-panel-placeholder
                    className={cn(
                      "border-line-2 text-tau-meta text-ink-3 rounded-tau-lg hidden min-h-[72px] flex-1 items-center justify-center border border-dashed group-has-[>[data-home-panel-content]:empty]/home-panel:flex group-has-[[data-home-panel-body]:empty]/home-panel:flex",
                      isSlot && "invisible"
                    )}
                  >
                    {panel.title} · 今天没有内容
                  </div>
                  {isSlot ? (
                    <div className="border-accent/40 bg-accent/5 rounded-tau-lg pointer-events-none absolute inset-0 border-[1.5px] border-dashed" />
                  ) : (
                    <div
                      data-home-panel-chrome
                      className="bg-surface shadow-lift ease-tau-out starting:scale-90 starting:opacity-0 absolute right-2 top-2 flex items-center gap-0.5 rounded-[9px] p-0.5 transition-[opacity,scale] duration-200"
                    >
                      <button
                        type="button"
                        data-home-panel-handle
                        aria-label={`移动「${panel.title}」`}
                        title="拖动调整位置，或用方向键移动"
                        onKeyDown={moveByKey(index)}
                        className={cn(CHROME_BUTTON, dragging ? "cursor-grabbing" : "cursor-grab")}
                      >
                        <GripVertical className={ICON} strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        data-home-panel-action
                        aria-label={`隐藏「${panel.title}」`}
                        title="隐藏"
                        onClick={() => hide(panel.id)}
                        className={CHROME_BUTTON}
                      >
                        <EyeOff className={ICON} strokeWidth={1.75} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          );
        })}
      </div>
      {editing && (
        <div
          ref={hiddenZoneRef}
          data-home-hidden-panels
          data-drop-over={overHidden || undefined}
          className="border-line-2 data-[drop-over]:border-accent data-[drop-over]:bg-accent-soft rounded-tau-lg ease-tau-out flex min-h-[52px] flex-wrap items-center gap-2 border-[1.5px] border-dashed px-4 py-2.5 transition-[background,border-color] duration-[160ms]"
        >
          <span className="text-tau-meta text-ink-3 mr-1">已隐藏</span>
          {trayPanels.map(panel => (
            <button
              key={panel.id}
              type="button"
              onPointerDown={startDrag(panel.id, "tray")}
              onClick={() => {
                if (draggedRef.current) draggedRef.current = false;
                else restore(panel.id);
              }}
              title="点击恢复到末尾，或拖到想放的位置"
              className={cn(
                "border-line-1 bg-surface text-tau-meta text-ink-2 hover:bg-hover hover:text-ink-1 ease-tau-out inline-flex cursor-grab items-center gap-1 rounded-[8px] border px-2.5 py-1 transition-[background,color,opacity] duration-[160ms]",
                dragId === panel.id && "opacity-40"
              )}
            >
              <Plus className="size-[13px]" strokeWidth={1.75} />
              {panel.title}
            </button>
          ))}
          {pendingHide ? (
            <span
              data-home-hidden-pending
              className="border-accent text-tau-meta text-accent-text bg-surface ease-tau-out starting:scale-95 starting:opacity-0 inline-flex items-center rounded-[8px] border-[1.5px] border-dashed px-2.5 py-1 transition-[opacity,scale] duration-150"
            >
              松手隐藏「{pendingHide.title}」
            </span>
          ) : (
            trayPanels.length === 0 && (
              <span className="text-tau-meta text-ink-3">把面板拖到这里即可隐藏</span>
            )
          )}
        </div>
      )}
    </>
  );
}
