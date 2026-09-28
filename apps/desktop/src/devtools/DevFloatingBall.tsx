/**
 * 开发悬浮球：只在开发构建里挂载，收纳开发期的快捷操作（重算知识地图等）。
 *
 * 为什么是悬浮球而不是菜单项或设置页：这些操作都是「边看效果边点」的，
 * 要在任何页面上一步可达、又不能挡住正在验证的界面——所以可拖到任意角落，位置记在本机。
 * 操作列表来自 registry，悬浮球本身不认识任何具体功能。
 */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Loader2, Wrench } from "lucide-react";
import { Popover, cn, toast } from "@tau/ui";
import { useDevActions, type DevAction } from "./registry";

const POSITION_KEY = "tau:dev-floating-ball";
const SIZE = 36;
const MARGIN = 12;
/** 位移小于它算点击，否则算拖动（避免手抖把点击吞掉） */
const DRAG_THRESHOLD = 4;

interface Position {
  /** 距视口右边、下边的距离：窗口缩放时球贴着同一个角，不会被挤出屏幕 */
  right: number;
  bottom: number;
}

function readPosition(): Position {
  try {
    const saved = JSON.parse(localStorage.getItem(POSITION_KEY) ?? "null") as Position | null;
    if (saved && Number.isFinite(saved.right) && Number.isFinite(saved.bottom)) return saved;
  } catch {
    // 坏数据就回到默认位置
  }
  return { right: 20, bottom: 88 };
}

function clampPosition(position: Position): Position {
  const maxRight = Math.max(MARGIN, window.innerWidth - SIZE - MARGIN);
  const maxBottom = Math.max(MARGIN, window.innerHeight - SIZE - MARGIN);
  return {
    right: Math.min(maxRight, Math.max(MARGIN, position.right)),
    bottom: Math.min(maxBottom, Math.max(MARGIN, position.bottom)),
  };
}

export function DevFloatingBall() {
  const actions = useDevActions();
  const [position, setPosition] = useState(() => clampPosition(readPosition()));
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [ball, setBall] = useState<HTMLButtonElement | null>(null);
  const drag = useRef<{ x: number; y: number; origin: Position; moved: boolean } | null>(null);
  /** 拖动中的最新位置：松手时落盘用，不从 state 更新函数里做副作用 */
  const latest = useRef(position);
  latest.current = position;

  useEffect(() => {
    const onResize = () => setPosition(current => clampPosition(current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, origin: position, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    if (!state) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (!state.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    state.moved = true;
    setPosition(
      clampPosition({ right: state.origin.right - dx, bottom: state.origin.bottom - dy })
    );
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!state) return;
    if (state.moved) {
      localStorage.setItem(POSITION_KEY, JSON.stringify(latest.current));
      return;
    }
    setOpen(value => !value);
  };

  const run = async (action: DevAction) => {
    if (running) return;
    setRunning(action.id);
    try {
      const result = await action.run();
      toast.success(result || `${action.label}：完成`);
    } catch (error) {
      toast.error(`${action.label}失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRunning(null);
    }
  };

  const groups = new Map<string, DevAction[]>();
  for (const action of actions) {
    const list = groups.get(action.group) ?? [];
    list.push(action);
    groups.set(action.group, list);
  }

  return (
    <>
      <button
        ref={setBall}
        type="button"
        aria-label="开发工具"
        aria-expanded={open}
        title="开发工具（可拖动）"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        style={{ right: position.right, bottom: position.bottom, width: SIZE, height: SIZE }}
        className={cn(
          "bg-surface border-line-1 text-ink-2 shadow-float fixed z-[1000] flex touch-none select-none",
          "items-center justify-center rounded-full border transition-colors duration-150",
          "hover:text-ink-1 focus-visible:ring-focus-ring focus-visible:outline-none focus-visible:ring-2",
          open && "text-accent-text border-accent"
        )}
      >
        {running ? (
          <Loader2 className="size-4 animate-spin" strokeWidth={1.75} aria-hidden />
        ) : (
          <Wrench className="size-4" strokeWidth={1.75} aria-hidden />
        )}
      </button>
      <Popover
        anchor={ball}
        open={open}
        onOpenChange={setOpen}
        placement="top-end"
        arrow={false}
        className="w-[300px]"
      >
        <Popover.Header icon={<Wrench className="size-[15px]" strokeWidth={1.75} />}>
          开发工具
        </Popover.Header>
        <Popover.Body>
          {groups.size === 0 ? (
            <p className="text-ink-3 text-tau-meta">还没有注册任何操作</p>
          ) : (
            <div className="flex flex-col gap-3">
              {[...groups].map(([group, list]) => (
                <section key={group} className="flex flex-col gap-1">
                  <h3 className="text-ink-3 text-tau-caption px-1 font-medium">{group}</h3>
                  {list.map(action => (
                    <button
                      key={action.id}
                      type="button"
                      disabled={running !== null}
                      onClick={() => void run(action)}
                      className={cn(
                        "rounded-tau-sm flex flex-col items-start gap-0.5 px-2 py-1.5 text-left",
                        "hover:bg-hover transition-colors duration-150 disabled:opacity-50"
                      )}
                    >
                      <span className="text-ink-1 text-tau-sm flex items-center gap-1.5">
                        {running === action.id && (
                          <Loader2
                            className="size-3.5 animate-spin"
                            strokeWidth={1.75}
                            aria-hidden
                          />
                        )}
                        {action.label}
                      </span>
                      {action.description && (
                        <span className="text-ink-3 text-tau-caption">{action.description}</span>
                      )}
                    </button>
                  ))}
                </section>
              ))}
            </div>
          )}
        </Popover.Body>
      </Popover>
    </>
  );
}
