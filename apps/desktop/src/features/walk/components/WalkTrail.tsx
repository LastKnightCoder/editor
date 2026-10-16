/**
 * 足迹条：漫步走过的全部站点排成一行，超出宽度时横向滚动（滚轮纵向转横向），
 * 当前站始终滚入视野，可滚的一侧边缘渐隐；站点不收缩，长标题在站内截断。
 * 站与站之间的连接符区分「经关系走来」与「随机跳转」；点击站点回看。
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Footprints, Shuffle } from "lucide-react";
import { cn } from "@tau/ui";
import { WALK_KIND_META } from "../model";
import type { WalkTrail } from "../trail";

/** 边缘渐隐带宽度（px） */
const FADE_PX = 28;

const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function WalkTrailBar({ trail, onGoto }: { trail: WalkTrail; onGoto(index: number): void }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const lastIndex = trail.steps.length - 1;

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges(prev => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  /* 当前站滚入视野（只动横向，不牵动页面纵向滚动）；新站追加或 ←/→ 回看时触发 */
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    const station = el?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!el || !station) return;
    const start = station.offsetLeft - FADE_PX;
    const end = station.offsetLeft + station.offsetWidth + FADE_PX - el.clientWidth;
    const target = el.scrollLeft > start ? start : el.scrollLeft < end ? end : null;
    if (target !== null && typeof el.scrollTo === "function") {
      el.scrollTo({ left: target, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }
    measure();
  }, [trail.index, trail.steps.length, measure]);

  const fadeLeft = edges.left ? `transparent, #000 ${FADE_PX}px` : "#000, #000";
  const fadeRight = edges.right ? `#000 calc(100% - ${FADE_PX}px), transparent` : "#000, #000";

  return (
    <div className="mt-3 flex h-[30px] flex-none items-center gap-2 px-8">
      <span className="text-tau-micro text-ink-3 mr-1 inline-flex flex-none items-center gap-1 whitespace-nowrap">
        <Footprints className="size-3.5" strokeWidth={1.75} />
        足迹
      </span>
      <div
        ref={scrollerRef}
        onScroll={measure}
        onWheel={e => {
          // 鼠标滚轮只有纵向分量：转成横向滚动
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
        }}
        style={{ maskImage: `linear-gradient(to right, ${fadeLeft}, ${fadeRight})` }}
        className="scrollbar-hide flex h-full min-w-0 flex-1 items-center gap-2 overflow-x-auto"
      >
        {trail.steps.map((step, index) => {
          const KindIcon = WALK_KIND_META[step.item.ref.kind].icon;
          const current = index === trail.index;
          return (
            <span key={index} className="flex flex-none items-center gap-2">
              {step.via.type === "relation" ? (
                <span className="bg-line-2 mx-0.5 h-px w-4 flex-none" />
              ) : step.via.type === "jump" ? (
                <Shuffle
                  className="text-accent mx-0.5 size-3.5 flex-none"
                  strokeWidth={1.75}
                  aria-label="随机跳转"
                />
              ) : null}
              <button
                type="button"
                aria-current={current ? "step" : undefined}
                onClick={() => onGoto(index)}
                className={cn(
                  "text-tau-meta text-ink-3 hover:bg-hover hover:text-ink-1 ease-tau-out inline-flex h-[26px] max-w-[160px] flex-none items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 transition-colors duration-[160ms]",
                  current && "bg-accent-soft text-accent-text font-medium",
                  index === lastIndex && "motion-safe:animate-fadeIn"
                )}
              >
                <KindIcon className="size-3 shrink-0" strokeWidth={1.75} />
                <span className="min-w-0 truncate">{step.item.title}</span>
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}
