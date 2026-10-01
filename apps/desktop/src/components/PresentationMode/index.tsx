/**
 * 演示模式（全屏舞台 + 镜头推进，DECISIONS D-072）。
 * 进入即窗口全屏（退出还原）；文档按结构分节（sections.ts），每节铺满舞台（SlideFrame），
 * 按窗口整体缩放——编辑器按常规尺寸排版，演示层不对编辑器的字号单位做任何假设。
 * 一节放不下时内容逐屏上移（cameraPlan.ts）；Esc 经 useOverlayDismiss 逐层退场。
 * 深浅色只作用于演示层（子树 data-mode + EditorThemeOverride），不改全局偏好。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Descendant } from "slate";
import { useMemoizedFn } from "ahooks";
import {
  ChevronLeft,
  ChevronRight,
  Keyboard,
  LayoutGrid,
  Maximize,
  Minimize,
  Moon,
  Sun,
  X,
} from "lucide-react";
import { EditorThemeOverride } from "@tau/editor";
import { cn } from "@tau/ui";
import { StageHud, StageHudButton, StageHudDivider, useStageTheme } from "@/components/Stage";
import PortalToBody from "@/components/PortalToBody";
import { useFindOwner } from "@/components/GlobalFindBar/findOwner";
import { isEditableTarget } from "@/page/dom";
import { useOverlayDismiss } from "@/page/PageProvider";
import { canToggleFullScreen, useFullScreenWhileMounted } from "@/hooks/useFullScreenWhileMounted";
import { SINGLE_SCREEN, type CameraPlan } from "./cameraPlan";
import { HelpPanel, Kbd } from "./HelpPanel";
import { Overview } from "./Overview";
import { sectionTitle, splitSections } from "./sections";
import { fitStage } from "./frame";
import { SlideFrame } from "./SlideFrame";

/** 鼠标进入屏幕底部这一带时显示控制条（屏幕像素） */
const HUD_ZONE = 140;
const IDLE_MS = 2000;
const HINT_MS = 3200;
const WHEEL_QUIET_MS = 450;
/** 进上一节时停在它的最后一屏（SlideFrame 按实际屏数收敛） */
const LAST_STEP = Number.MAX_SAFE_INTEGER;
const INTERACTIVE_TARGET =
  "a,button,input,textarea,select,video,audio,iframe,[role=button],[contenteditable=true]";

type Direction = 1 | -1;

const ignoreFind = () => undefined;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function easeOut() {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--ease-tau-out");
  return value.trim() || "ease-out";
}

function useStage() {
  const [size, setSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return useMemo(() => fitStage(size.width, size.height), [size.width, size.height]);
}

function StepDots({ count, current }: { count: number; current: number }) {
  if (count < 2) return null;
  return (
    <span className="mx-2 inline-flex gap-1" aria-label={`第 ${current + 1} / ${count} 屏`}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={cn(
            "ease-tau-out h-1.5 rounded-full transition-all duration-200",
            i === current ? "bg-accent w-4" : "bg-line-1 w-1.5"
          )}
        />
      ))}
    </span>
  );
}

interface PresentationModeProps {
  content: Descendant[];
  onExit: () => void;
}

const PresentationMode = ({ content, onExit }: PresentationModeProps) => {
  const sections = useMemo(() => splitSections(content), [content]);
  const total = sections.length;
  const paged = total > 1;

  const [page, setPage] = useState(0);
  const [step, setStep] = useState(0);
  const [plan, setPlan] = useState<CameraPlan>(SINGLE_SCREEN);
  const [overview, setOverview] = useState(false);
  const [overviewSelected, setOverviewSelected] = useState(0);
  const [help, setHelp] = useState(false);
  const [jump, setJumpState] = useState("");
  // 连续按键先于重渲染到达：跳页缓冲以 ref 为准
  const jumpRef = useRef("");
  const setJump = (value: string) => {
    jumpRef.current = value;
    setJumpState(value);
  };
  const [idle, setIdle] = useState(false);
  const [hudHovered, setHudHovered] = useState(false);
  const [nearBottom, setNearBottom] = useState(false);
  const [hint, setHint] = useState(true);
  const {
    mode: stageMode,
    toggle: toggleStageMode,
    rootProps: stageThemeProps,
    scopeClass,
  } = useStageTheme();

  const stage = useStage();
  const { fullScreen, toggle: toggleFullScreen } = useFullScreenWhileMounted();
  const frameRef = useRef<HTMLDivElement>(null);
  const enterDirection = useRef<Direction | null>(null);
  const columnsRef = useRef(1);
  const idleTimer = useRef(0);
  const wheelTimer = useRef(0);

  const screens = plan.steps.length;
  const current = Math.min(step, screens - 1);
  const canAdvance = paged || screens > 1;

  useOverlayDismiss(onExit);
  useOverlayDismiss(() => setOverview(false), overview);
  useOverlayDismiss(() => setHelp(false), help);
  // 放映期间 Ctrl/⌘+F 不对被遮住的页面生效
  useFindOwner(ignoreFind, true);

  const handleColumns = useCallback((columns: number) => {
    columnsRef.current = columns;
  }, []);

  // 代码高亮、图片等会异步撑高内容、增加屏数：「停在末屏」保持为意图，直到用户再次推进
  const handlePlan = useCallback((next: CameraPlan) => {
    setPlan(next);
    setStep(prev => (prev === LAST_STEP ? prev : Math.min(prev, next.steps.length - 1)));
  }, []);

  const bounce = useMemoizedFn((direction: Direction) => {
    const frame = frameRef.current;
    if (!frame || prefersReducedMotion()) return;
    frame.animate(
      [
        { transform: "translateX(0)" },
        { transform: `translateX(${-12 * direction}px)`, offset: 0.3 },
        { transform: "translateX(0)" },
      ],
      { duration: 320, easing: easeOut() }
    );
  });

  const goPage = useMemoizedFn((target: number, direction: Direction, atEnd = false) => {
    if (target < 0 || target >= total) return bounce(direction);
    if (target === page) return setStep(atEnd ? LAST_STEP : 0);
    enterDirection.current = direction;
    setPlan(SINGLE_SCREEN);
    setPage(target);
    setStep(atEnd ? LAST_STEP : 0);
  });

  const next = useMemoizedFn(() => {
    if (current < screens - 1) setStep(current + 1);
    else goPage(page + 1, 1);
  });

  const prev = useMemoizedFn(() => {
    if (current > 0) setStep(current - 1);
    else goPage(page - 1, -1, true);
  });

  // 换节进场：沿推进方向滑入
  useLayoutEffect(() => {
    const direction = enterDirection.current;
    const frame = frameRef.current;
    enterDirection.current = null;
    if (!direction || !frame) return;
    const from = prefersReducedMotion()
      ? { opacity: 0 }
      : { opacity: 0, transform: `translateX(${28 * direction}px)` };
    frame.animate([from, { opacity: 1, transform: "none" }], {
      duration: 280,
      easing: easeOut(),
    });
  }, [page]);

  const openOverview = useMemoizedFn(() => {
    if (!paged) return;
    setOverviewSelected(page);
    setOverview(true);
  });

  const enterFromOverview = useMemoizedFn((index: number) => {
    setOverview(false);
    goPage(index, index >= page ? 1 : -1);
  });

  const handleKey = useMemoizedFn((key: string): boolean => {
    if (help) {
      if (key !== "?") return false;
      setHelp(false);
      return true;
    }
    if (overview) {
      const columns = columnsRef.current;
      const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[key];
      if (delta) {
        setOverviewSelected(selected => Math.min(total - 1, Math.max(0, selected + delta)));
        return true;
      }
      if (key === "Enter" || key === " ") {
        enterFromOverview(overviewSelected);
        return true;
      }
      if (key === "o" || key === "O") {
        setOverview(false);
        return true;
      }
      if (key === "?") {
        setHelp(true);
        return true;
      }
      return false;
    }
    const pending = jumpRef.current;
    if (paged && /^\d$/.test(key)) {
      setJump((pending + key).slice(0, 3));
      return true;
    }
    if (pending) {
      if (key === "Backspace") {
        setJump(pending.slice(0, -1));
        return true;
      }
      setJump("");
      if (key === "Enter") {
        const target = Number(pending) - 1;
        goPage(target, target >= page ? 1 : -1);
        return true;
      }
    }
    switch (key) {
      case "ArrowRight":
      case "ArrowDown":
      case "PageDown":
      case " ":
      case "Enter":
        next();
        return true;
      case "ArrowLeft":
      case "ArrowUp":
      case "PageUp":
        prev();
        return true;
      case "Home":
        goPage(0, -1);
        return true;
      case "End":
        goPage(total - 1, 1, true);
        return true;
      case "o":
      case "O":
        openOverview();
        return true;
      case "f":
      case "F":
        toggleFullScreen();
        return true;
      case "d":
      case "D":
        toggleStageMode();
        return true;
      case "?":
        setHelp(true);
        return true;
      default:
        return false;
    }
  });

  // 捕获阶段接管推进键，不让被遮住的页面响应；Esc 与带修饰键的组合留给框架仲裁
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey || e.key === "Escape") return;
      // 叠在上面的浮层（如命令面板）里的输入不接管
      if (isEditableTarget(e.target)) return;
      if (handleKey(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [handleKey]);

  const wake = useMemoizedFn(() => {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), IDLE_MS);
  });

  useEffect(() => {
    wake();
    const hintTimer = window.setTimeout(() => setHint(false), HINT_MS);
    return () => {
      window.clearTimeout(idleTimer.current);
      window.clearTimeout(wheelTimer.current);
      window.clearTimeout(hintTimer);
    };
  }, [wake]);

  const onMouseMove = (e: React.MouseEvent) => {
    wake();
    setNearBottom(e.clientY > window.innerHeight - HUD_ZONE);
  };

  // 触控板惯性会连发事件：安静一段时间后才接受下一次推进
  const onWheel = (e: React.WheelEvent) => {
    if (overview || help) return;
    const locked = wheelTimer.current !== 0;
    window.clearTimeout(wheelTimer.current);
    wheelTimer.current = window.setTimeout(() => (wheelTimer.current = 0), WHEEL_QUIET_MS);
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (locked || Math.abs(delta) < 30) return;
    if (delta > 0) next();
    else prev();
  };

  const onStageClick = (e: React.MouseEvent) => {
    if (!canAdvance || window.getSelection()?.toString()) return;
    if ((e.target as HTMLElement).closest(INTERACTIVE_TARGET)) return;
    if (e.clientX / window.innerWidth > 1 / 3) next();
    else prev();
  };

  // 控制条只在进场提示期间、鼠标在底部或有浮层时出现；光标静止即隐藏
  const hudVisible = hint || nearBottom || hudHovered || overview || help;
  const cursorHidden = idle && !hudVisible;
  const title = sectionTitle(sections[page]);
  const lastScreen = current === screens - 1;

  return (
    <PortalToBody>
      <div
        role="dialog"
        aria-label="演示"
        {...stageThemeProps}
        className={cn(
          "app-region-no-drag bg-surface text-ink-1 fixed inset-0 z-[95] select-none overflow-hidden",
          scopeClass,
          cursorHidden && "cursor-none"
        )}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setNearBottom(false)}
        onWheel={onWheel}
      >
        <EditorThemeOverride mode={stageMode}>
          {paged && (
            <div
              className="bg-accent ease-tau-out absolute left-0 top-0 z-10 h-[3px] transition-[width] duration-300"
              style={{ width: `${((page + 1) / total) * 100}%` }}
            />
          )}

          <div ref={frameRef} className="absolute inset-0" onClick={onStageClick}>
            <div
              className="absolute left-0 top-0 origin-top-left select-text"
              style={{ transform: `scale(${stage.scale})` }}
            >
              <SlideFrame
                key={page}
                section={sections[page]}
                width={stage.width}
                height={stage.height}
                step={current}
                onPlan={handlePlan}
                pageNumber={paged ? page + 1 : undefined}
              />
            </div>
          </div>

          {hint && (
            <div className="text-tau-sm text-ink-3 pointer-events-none absolute bottom-[84px] left-1/2 flex -translate-x-1/2 gap-3.5 whitespace-nowrap">
              {canAdvance && (
                <span>
                  <Kbd>←</Kbd> <Kbd>→</Kbd> 推进
                </span>
              )}
              {paged && (
                <span>
                  <Kbd>O</Kbd> 全览
                </span>
              )}
              <span>
                <Kbd>?</Kbd> 快捷键
              </span>
              <span>
                <Kbd>Esc</Kbd> 退出
              </span>
            </div>
          )}

          <StageHud
            visible={hudVisible}
            onMouseEnter={() => setHudHovered(true)}
            onMouseLeave={() => setHudHovered(false)}
          >
            {paged && (
              <>
                <StageHudButton
                  label="上一屏"
                  shortcut="←"
                  onClick={prev}
                  disabled={page === 0 && current === 0}
                >
                  <ChevronLeft className="size-4" strokeWidth={1.75} />
                </StageHudButton>
                <button
                  type="button"
                  onClick={openOverview}
                  className="text-ink-1 hover:bg-hover h-8 min-w-16 rounded-full px-2 font-medium tabular-nums"
                >
                  {jump ? (
                    <span className="text-accent-text">跳到 {jump}</span>
                  ) : (
                    <>
                      {page + 1}
                      <span className="text-ink-3 mx-[3px] font-normal">/</span>
                      {total}
                    </>
                  )}
                </button>
                <StageHudButton
                  label="下一屏"
                  shortcut="→"
                  onClick={next}
                  disabled={page === total - 1 && lastScreen}
                >
                  <ChevronRight className="size-4" strokeWidth={1.75} />
                </StageHudButton>
                <StageHudDivider />
              </>
            )}
            {title && <span className="text-ink-1 max-w-60 truncate px-2.5">{title}</span>}
            <StepDots count={screens} current={current} />
            {(title || screens > 1) && <StageHudDivider />}
            {paged && (
              <StageHudButton label="全览" shortcut="O" onClick={openOverview} active={overview}>
                <LayoutGrid className="size-4" strokeWidth={1.75} />
              </StageHudButton>
            )}
            <StageHudButton
              label={stageMode === "dark" ? "浅色画面" : "深色画面"}
              shortcut="D"
              onClick={toggleStageMode}
            >
              {stageMode === "dark" ? (
                <Sun className="size-4" strokeWidth={1.75} />
              ) : (
                <Moon className="size-4" strokeWidth={1.75} />
              )}
            </StageHudButton>
            {canToggleFullScreen() && (
              <StageHudButton
                label={fullScreen ? "退出全屏" : "全屏"}
                shortcut="F"
                onClick={toggleFullScreen}
              >
                {fullScreen ? (
                  <Minimize className="size-4" strokeWidth={1.75} />
                ) : (
                  <Maximize className="size-4" strokeWidth={1.75} />
                )}
              </StageHudButton>
            )}
            <StageHudButton label="快捷键" shortcut="?" onClick={() => setHelp(true)}>
              <Keyboard className="size-4" strokeWidth={1.75} />
            </StageHudButton>
            <StageHudDivider />
            <StageHudButton label="退出演示" shortcut="Esc" onClick={onExit}>
              <X className="size-4" strokeWidth={1.75} />
            </StageHudButton>
          </StageHud>

          {overview && (
            <Overview
              sections={sections}
              stage={stage}
              current={page}
              selected={overviewSelected}
              onColumns={handleColumns}
              onEnter={enterFromOverview}
            />
          )}
          {help && <HelpPanel paged={paged} onClose={() => setHelp(false)} />}
        </EditorThemeOverride>
      </div>
    </PortalToBody>
  );
};

export default PresentationMode;
