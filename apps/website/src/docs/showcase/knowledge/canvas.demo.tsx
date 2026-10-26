/**
 * 白板画布的常用操作：拖动形状（连着的箭头跟着走）、从形状边上的连接点拖出箭头连到另一个形状、
 * 按住 ⌘/Ctrl 点选多个形状后用浮动属性条对齐或均分、把形状拖进画框。
 * 工具栏、属性条与画框标题按 packages/whiteboard 的 Toolbar、ChromeBar、MultiSelectSetter、Frame 重建。
 */
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowUpRight,
  AudioLines,
  Columns3,
  FileText,
  Globe,
  Image as ImageIcon,
  Presentation,
  Video,
  Frame as FrameIcon,
  MousePointer2,
  Network,
  PenLine,
  Shapes,
  Type,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";

interface Shape {
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tone: string;
}

interface Arrow {
  id: string;
  from: string;
  to: string;
}

const FRAME = { x: 300, y: 70, w: 270, h: 230, title: "每天的深度时段" };

const INITIAL: Shape[] = [
  {
    id: "a",
    text: "关掉通知",
    x: 40,
    y: 92,
    w: 112,
    h: 52,
    tone: "var(--tau-tag-1)",
  },
  {
    id: "b",
    text: "列出今天最重要的事",
    x: 40,
    y: 214,
    w: 150,
    h: 52,
    tone: "var(--tau-tag-3)",
  },
  {
    id: "c",
    text: "专注 90 分钟",
    x: 330,
    y: 118,
    w: 120,
    h: 52,
    tone: "var(--tau-tag-2)",
  },
  {
    id: "d",
    text: "复盘与记录",
    x: 410,
    y: 222,
    w: 112,
    h: 52,
    tone: "var(--tau-tag-4)",
  },
];

const INITIAL_ARROWS: Arrow[] = [{ id: "a-c", from: "a", to: "c" }];

const TOOLS: { icon: LucideIcon; label: string; group: number }[] = [
  { icon: MousePointer2, label: "选择", group: 0 },
  { icon: Shapes, label: "形状", group: 1 },
  { icon: ArrowUpRight, label: "箭头", group: 1 },
  { icon: PenLine, label: "手写", group: 1 },
  { icon: Type, label: "文本", group: 1 },
  { icon: Network, label: "思维导图", group: 1 },
  { icon: ImageIcon, label: "图片", group: 2 },
  { icon: Video, label: "视频", group: 2 },
  { icon: AudioLines, label: "音频", group: 2 },
  { icon: Globe, label: "网页", group: 2 },
  { icon: FileText, label: "文档", group: 3 },
  { icon: Presentation, label: "白板", group: 3 },
  { icon: FrameIcon, label: "画框", group: 4 },
  { icon: Columns3, label: "分栏", group: 4 },
];

type Side = "top" | "right" | "bottom" | "left";
const SIDES: Side[] = ["top", "right", "bottom", "left"];

const pointOf = (shape: Shape, side: Side) => {
  if (side === "top") return { x: shape.x + shape.w / 2, y: shape.y };
  if (side === "bottom") return { x: shape.x + shape.w / 2, y: shape.y + shape.h };
  if (side === "left") return { x: shape.x, y: shape.y + shape.h / 2 };
  return { x: shape.x + shape.w, y: shape.y + shape.h / 2 };
};

/** 两个形状之间取距离最近的一对连接点 */
function nearestSides(a: Shape, b: Shape) {
  let best = { from: pointOf(a, "right"), to: pointOf(b, "left"), d: Infinity };
  for (const s1 of SIDES)
    for (const s2 of SIDES) {
      const p = pointOf(a, s1);
      const q = pointOf(b, s2);
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < best.d) best = { from: p, to: q, d };
    }
  return best;
}

const inFrame = (shape: Shape) =>
  shape.x >= FRAME.x &&
  shape.y >= FRAME.y &&
  shape.x + shape.w <= FRAME.x + FRAME.w &&
  shape.y + shape.h <= FRAME.y + FRAME.h;

type Drag =
  | {
      kind: "move";
      ids: string[];
      startX: number;
      startY: number;
      origin: Record<string, { x: number; y: number }>;
    }
  | { kind: "connect"; from: string; x: number; y: number };

export default function CanvasDemo() {
  const [shapes, setShapes] = useState(INITIAL);
  const [arrows, setArrows] = useState(INITIAL_ARROWS);
  const [selected, setSelected] = useState<string[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = boardRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const byId = (id: string) => shapes.find(shape => shape.id === id)!;
  const hitShape = (x: number, y: number) =>
    shapes.find(s => x >= s.x - 6 && x <= s.x + s.w + 6 && y >= s.y - 6 && y <= s.y + s.h + 6);

  const startMove = (event: ReactPointerEvent, id: string) => {
    event.stopPropagation();
    const multi = event.metaKey || event.ctrlKey;
    const next = multi
      ? selected.includes(id)
        ? selected.filter(item => item !== id)
        : [...selected, id]
      : selected.includes(id)
        ? selected
        : [id];
    setSelected(next);
    if (!next.includes(id)) return;
    const p = local(event);
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    setDrag({
      kind: "move",
      ids: next,
      startX: p.x,
      startY: p.y,
      origin: Object.fromEntries(shapes.map(s => [s.id, { x: s.x, y: s.y }])),
    });
  };

  const startConnect = (event: ReactPointerEvent, id: string) => {
    event.stopPropagation();
    const p = local(event);
    boardRef.current?.setPointerCapture?.(event.pointerId);
    setDrag({ kind: "connect", from: id, x: p.x, y: p.y });
  };

  const onMove = (event: ReactPointerEvent) => {
    if (!drag) return;
    const p = local(event);
    if (drag.kind === "connect") {
      setDrag({ ...drag, x: p.x, y: p.y });
      return;
    }
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;
    setShapes(list =>
      list.map(shape =>
        drag.ids.includes(shape.id)
          ? {
              ...shape,
              x: Math.max(4, drag.origin[shape.id].x + dx),
              y: Math.max(56, drag.origin[shape.id].y + dy),
            }
          : shape
      )
    );
  };

  const onUp = () => {
    if (drag?.kind === "connect") {
      const target = hitShape(drag.x, drag.y);
      if (target && target.id !== drag.from) {
        const id = `${drag.from}-${target.id}`;
        setArrows(list =>
          list.some(arrow => arrow.id === id)
            ? list
            : [...list, { id, from: drag.from, to: target.id }]
        );
      }
    }
    setDrag(null);
  };

  const align = (kind: "left" | "right" | "top" | "bottom" | "h" | "v") => {
    const picked = shapes.filter(shape => selected.includes(shape.id));
    if (picked.length < 2) return;
    const minX = Math.min(...picked.map(s => s.x));
    const maxR = Math.max(...picked.map(s => s.x + s.w));
    const minY = Math.min(...picked.map(s => s.y));
    const maxB = Math.max(...picked.map(s => s.y + s.h));
    const place = new Map<string, Partial<Shape>>();
    if (kind === "left") picked.forEach(s => place.set(s.id, { x: minX }));
    if (kind === "right") picked.forEach(s => place.set(s.id, { x: maxR - s.w }));
    if (kind === "top") picked.forEach(s => place.set(s.id, { y: minY }));
    if (kind === "bottom") picked.forEach(s => place.set(s.id, { y: maxB - s.h }));
    if (kind === "h" || kind === "v") {
      const horizontal = kind === "h";
      const sorted = [...picked].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
      const total = sorted.reduce((sum, s) => sum + (horizontal ? s.w : s.h), 0);
      const span = horizontal ? maxR - minX : maxB - minY;
      const gap = (span - total) / Math.max(sorted.length - 1, 1);
      let cursor = horizontal ? minX : minY;
      sorted.forEach(s => {
        place.set(s.id, horizontal ? { x: cursor } : { y: cursor });
        cursor += (horizontal ? s.w : s.h) + gap;
      });
    }
    setShapes(list => list.map(s => ({ ...s, ...place.get(s.id) })));
  };

  const picked = shapes.filter(shape => selected.includes(shape.id));
  const bar =
    picked.length > 0
      ? {
          x: (Math.min(...picked.map(s => s.x)) + Math.max(...picked.map(s => s.x + s.w))) / 2,
          y: Math.min(...picked.map(s => s.y)) - 12,
        }
      : null;
  const frameActive =
    drag?.kind === "move" && shapes.some(shape => drag.ids.includes(shape.id) && inFrame(shape));
  const connectTarget = drag?.kind === "connect" ? hitShape(drag.x, drag.y) : undefined;

  return (
    <AppWindow active="whiteboard" crumb="白板 / 深度工作计划" height={430}>
      <div
        ref={boardRef}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        onPointerDown={() => setSelected([])}
        className="relative h-full touch-none overflow-hidden bg-[radial-gradient(var(--tau-line-1)_1px,transparent_1px)] bg-[length:20px_20px]"
      >
        {/* 工具栏 */}
        <div className="bg-surface shadow-lift ring-line-2 absolute top-3 left-1/2 z-[6] flex -translate-x-1/2 items-center gap-0.5 rounded-[12px] p-1 ring-1">
          {TOOLS.map((tool, index) => {
            const Icon = tool.icon;
            return (
              <span
                key={tool.label}
                className={cn(
                  "flex items-center",
                  (tool.group === 2 || tool.group === 3) && "max-sm:hidden"
                )}
              >
                {index > 0 && TOOLS[index - 1].group !== tool.group && (
                  <span className="size-2 flex-none" />
                )}
                <span
                  title={tool.label}
                  className={cn(
                    "grid size-[30px] place-items-center rounded-[8px]",
                    index === 0 ? "bg-accent-soft text-accent-text" : "text-ink-2"
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.75} />
                </span>
              </span>
            );
          })}
        </div>

        {/* 画框 */}
        <div
          className={cn(
            "pointer-events-none absolute rounded-[12px] border-2 transition-colors",
            frameActive ? "border-accent bg-accent-soft/40" : "border-[var(--tau-tag-5)]"
          )}
          style={{
            left: FRAME.x,
            top: FRAME.y,
            width: FRAME.w,
            height: FRAME.h,
          }}
        >
          <span
            className="text-ink-inverse absolute -top-[30px] left-0 flex h-[26px] items-center rounded-lg px-2 text-sm font-medium"
            style={{ background: "var(--tau-tag-5)" }}
          >
            {FRAME.title}
          </span>
        </div>

        {/* 箭头 */}
        <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
          <defs>
            <marker
              id="canvas-demo-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0 0L10 5L0 10z" fill="var(--tau-ink-2)" />
            </marker>
          </defs>
          {arrows.map(arrow => {
            const { from, to } = nearestSides(byId(arrow.from), byId(arrow.to));
            return (
              <line
                key={arrow.id}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="var(--tau-ink-2)"
                strokeWidth={1.75}
                markerEnd="url(#canvas-demo-arrow)"
              />
            );
          })}
          {drag?.kind === "connect" && (
            <line
              x1={pointOf(byId(drag.from), "right").x}
              y1={pointOf(byId(drag.from), "right").y}
              x2={drag.x}
              y2={drag.y}
              stroke="var(--tau-accent)"
              strokeWidth={1.75}
              strokeDasharray="5 4"
              markerEnd="url(#canvas-demo-arrow)"
            />
          )}
        </svg>

        {/* 形状 */}
        {shapes.map(shape => {
          const on = selected.includes(shape.id);
          const showPoints = (hover === shape.id || on) && drag?.kind !== "move";
          return (
            <div
              key={shape.id}
              onPointerDown={event => startMove(event, shape.id)}
              onPointerEnter={() => setHover(shape.id)}
              onPointerLeave={() => setHover(h => (h === shape.id ? null : h))}
              className={cn(
                "absolute grid cursor-move place-items-center rounded-[10px] border-[1.5px] px-2 text-center text-[12.5px] font-medium select-none",
                connectTarget?.id === shape.id && "ring-accent ring-2 ring-offset-2"
              )}
              style={{
                left: shape.x,
                top: shape.y,
                width: shape.w,
                height: shape.h,
                borderColor: shape.tone,
                background: `color-mix(in srgb, ${shape.tone} 14%, var(--tau-bg-surface))`,
                outline: on ? "1.5px solid var(--tau-accent)" : undefined,
                outlineOffset: 4,
              }}
            >
              {shape.text}
              {showPoints &&
                SIDES.map(side => {
                  const p = pointOf(shape, side);
                  return (
                    <span
                      key={side}
                      title="拖出箭头"
                      onPointerDown={event => startConnect(event, shape.id)}
                      className="bg-accent absolute size-[10px] -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full opacity-80 ring-2 ring-[var(--tau-bg-surface)] hover:scale-125"
                      style={{ left: p.x - shape.x, top: p.y - shape.y }}
                    />
                  );
                })}
            </div>
          );
        })}

        {/* 多选时的浮动属性条 */}
        {bar && picked.length > 1 && drag?.kind !== "move" && (
          <div
            onPointerDown={event => event.stopPropagation()}
            className="bg-surface shadow-lift ring-line-2 animate-doc-in absolute z-[7] flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-[12px] p-1 ring-1"
            style={{ left: bar.x, top: bar.y }}
          >
            {(
              [
                ["左对齐", AlignStartVertical, "left"],
                ["右对齐", AlignEndVertical, "right"],
                ["顶部对齐", AlignStartHorizontal, "top"],
                ["底部对齐", AlignEndHorizontal, "bottom"],
                ["横向均分", AlignHorizontalDistributeCenter, "h"],
                ["纵向均分", AlignVerticalDistributeCenter, "v"],
              ] as const
            ).map(([label, Icon, kind]) => (
              <button
                key={kind}
                type="button"
                title={label}
                aria-label={label}
                onClick={() => align(kind)}
                className="text-ink-2 hover:bg-hover hover:text-ink-1 grid size-[30px] place-items-center rounded-[8px]"
              >
                <Icon className="size-4" strokeWidth={1.75} />
              </button>
            ))}
          </div>
        )}

        <div className="text-ink-3 text-tau-tiny absolute bottom-4 left-4 z-[3] flex flex-wrap items-center gap-3 max-sm:hidden">
          <span>拖动形状移动</span>
          <span>从边上的圆点拖到另一个形状连线</span>
          <span>
            <kbd className="bg-hover rounded px-1 font-mono">⌘</kbd> /{" "}
            <kbd className="bg-hover rounded px-1 font-mono">Ctrl</kbd> + 点击多选后对齐
          </span>
        </div>
      </div>
    </AppWindow>
  );
}
