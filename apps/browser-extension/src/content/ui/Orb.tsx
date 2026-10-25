import { useRef, useState } from "react";
import { Highlighter, NotebookPen, Sparkles } from "lucide-react";
import { cn } from "@tau/ui";
import { useCompanion } from "../state/store";
import { useController } from "./context";

const ORB = 36;
const DRAG_THRESHOLD = 4;

const STATUS_DOT: Record<string, string> = {
  ready: "bg-ok",
  pairing: "bg-warn",
  connecting: "bg-warn",
};

/**
 * 悬浮球：贴在视口边缘的半圆把手（不是右下角圆钮），常态一半藏在视口外。
 * 悬停整颗滑出并竖向展开快捷动作；单击开关面板；沿边上下拖动，拖过视口中线换边，位置按站点记住。
 */
export function Orb() {
  const controller = useController();
  const side = useCompanion(state => state.side);
  const ratio = useCompanion(state => state.orbRatio);
  const panelOpen = useCompanion(state => state.panelOpen);
  const status = useCompanion(state => state.status.state);
  const count = useCompanion(state => state.annotations.length);
  const [drag, setDrag] = useState<{ top: number; side: "left" | "right" } | null>(null);
  const start = useRef<{ x: number; y: number; top: number; moved: boolean } | null>(null);

  const top = drag?.top ?? ratio * innerHeight;
  const edge = drag?.side ?? side;
  const clampTop = (value: number) => Math.max(ORB + 120, Math.min(innerHeight - ORB, value));

  return (
    <div
      className={cn(
        "group fixed z-30 size-9 transition-transform duration-300 ease-tau-out",
        edge === "right" ? "right-0" : "left-0",
        drag ? "transition-none" : "",
        panelOpen
          ? edge === "right"
            ? "-translate-x-3"
            : "translate-x-3"
          : edge === "right"
            ? "translate-x-1/2 hover:-translate-x-3"
            : "-translate-x-1/2 hover:translate-x-3"
      )}
      style={{ top: top - ORB / 2 }}
    >
      {/* 悬停热区向上延伸，覆盖快捷动作列 */}
      <div className="absolute -inset-x-2 bottom-0 hidden h-[168px] group-hover:block" />
      {!drag && (
        <div className="bg-surface shadow-float pointer-events-none absolute bottom-[46px] left-1/2 flex -translate-x-1/2 flex-col gap-0.5 rounded-full p-1 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100">
          <QuickAction
            label="问这页"
            hint="⌥J"
            side={edge}
            onClick={() => controller.openPanel("chat")}
          >
            <Sparkles size={15} strokeWidth={1.8} />
          </QuickAction>
          <QuickAction
            label="本页标注"
            side={edge}
            onClick={() => controller.openPanel("annotations")}
          >
            <Highlighter size={15} strokeWidth={1.8} />
          </QuickAction>
          <QuickAction label="页面笔记" side={edge} onClick={() => controller.openPanel("note")}>
            <NotebookPen size={15} strokeWidth={1.8} />
          </QuickAction>
        </div>
      )}
      <button
        type="button"
        aria-label={panelOpen ? "关闭伴读面板" : "打开伴读面板"}
        className={cn(
          "bg-surface shadow-lift text-accent-text relative grid size-9 cursor-grab place-items-center rounded-full font-serif text-[19px] font-semibold italic leading-none touch-none",
          panelOpen ? "ring-accent ring-[1.5px]" : "ring-line-1 ring-1",
          drag && "cursor-grabbing"
        )}
        onPointerDown={event => {
          start.current = { x: event.clientX, y: event.clientY, top, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          const origin = start.current;
          if (!origin) return;
          if (
            !origin.moved &&
            Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < DRAG_THRESHOLD
          )
            return;
          origin.moved = true;
          setDrag({
            top: clampTop(origin.top + event.clientY - origin.y),
            side: event.clientX < innerWidth / 2 ? "left" : "right",
          });
        }}
        onPointerUp={() => {
          const origin = start.current;
          start.current = null;
          if (origin?.moved && drag) {
            controller.saveOrbPosition(drag.side, drag.top / innerHeight);
            setDrag(null);
            return;
          }
          setDrag(null);
          controller.togglePanel();
        }}
      >
        τ
        <span
          className={cn(
            "ring-surface absolute -bottom-px -right-px size-2.5 rounded-full ring-2",
            STATUS_DOT[status] ?? "bg-ink-3"
          )}
        />
        {count > 0 && (
          <span className="bg-accent text-ink-inverse absolute -top-1.5 -left-1.5 h-4 min-w-4 rounded-full px-1 text-center font-sans text-[10px] leading-4 font-semibold not-italic">
            {count}
          </span>
        )}
      </button>
    </div>
  );
}

function QuickAction({
  label,
  hint,
  side,
  onClick,
  children,
}: {
  label: string;
  hint?: string;
  side: "left" | "right";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="text-ink-2 hover:bg-hover hover:text-ink-1 group/action relative grid size-[30px] place-items-center rounded-full"
    >
      {children}
      <span
        className={cn(
          "bg-ink-1 text-surface text-tau-sm pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md px-2 py-1 opacity-0 transition-opacity duration-100 group-hover/action:opacity-100",
          side === "right" ? "right-10" : "left-10"
        )}
      >
        {label}
        {hint && <span className="ml-1.5 font-mono text-[11px] opacity-60">{hint}</span>}
      </span>
    </button>
  );
}
