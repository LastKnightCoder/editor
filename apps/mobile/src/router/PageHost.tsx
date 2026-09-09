// L3 渲染层：渲染 screen 栈。转场期间栈顶两页同动（视差），其余页面经
// React <Activity> 保活（state+DOM 保留、effect 卸载）。

import { Activity } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "motion/react";

// motion/react 未直接导出 LayerAnimationControls 类型名，从 hook 推导
export type LayerAnimationControls = ReturnType<typeof useAnimationControls>;
import { getPageDefinition } from "./registry";
import { getPageMeta, type KeepAlivePolicy, type TransitionConfig } from "./core/pageMeta";
import { collectKeepAliveEvictionCandidates, type RouteEntry } from "./core/stackMachine";
import { PageStoreScope } from "./store/PageStoreScope";
import { SCREEN_BASE, SCREEN_TOP } from "./zIndex";
import { useRouterContext } from "./RouterProvider";
import {
  PageInstanceProvider,
  type PageInstanceContextValue,
  type PagePhase,
  type PageTransitionEventType,
} from "./pageLifecycle";
import {
  resolveScreenEnterMotion,
  resolveScreenExitMotion,
  SCREEN_PARALLAX_RATIO,
  shouldParallaxUnderlay,
} from "./transition";
import { useEdgeBackGesture } from "./gesture";

type ScreenSurface = "active" | "underlay-parallax" | "underlay-flat" | "deeper";

const PARALLAX_X = `${-SCREEN_PARALLAX_RATIO * 100}%`;
const ENTER_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

function settleSurface(controls: LayerAnimationControls, surface: ScreenSurface): void {
  if (surface === "active") {
    controls.set({ x: 0, y: 0 });
  } else if (surface === "underlay-parallax") {
    controls.set({ x: PARALLAX_X });
  } else if (surface === "underlay-flat") {
    controls.set({ x: 0 });
  }
}

type PageLayerProps = {
  entry: RouteEntry;
  layerIndex: number;
  surface: ScreenSurface;
  /** LRU 淘汰中：卸载内容释放内存，entry 留栈（数据仍在 query 缓存） */
  evicted: boolean;
  keepAlive: KeepAlivePolicy;
  animateOnMount: boolean;
  transition: TransitionConfig;
  onControlsReady: (id: string, controls: LayerAnimationControls | null) => void;
  renderContent: (entry: RouteEntry) => ReactNode;
};

function PageLayer({
  entry,
  layerIndex,
  surface,
  evicted,
  keepAlive,
  animateOnMount,
  transition,
  onControlsReady,
  renderContent,
}: PageLayerProps) {
  const controls = useAnimationControls();
  const reducedMotion = useReducedMotion() === true;
  const enterMotion = resolveScreenEnterMotion(transition, reducedMotion);
  const exitMotion = resolveScreenExitMotion(transition, reducedMotion);
  const enterSeconds = Math.max(transition.enterMs, 0) / 1000;
  const exitSeconds = Math.max(transition.exitMs, 0) / 1000;
  const prevSurfaceRef = useRef<ScreenSurface | null>(null);
  const animateOnMountRef = useRef(animateOnMount);
  animateOnMountRef.current = animateOnMount;
  const [transitionEvent, setTransitionEvent] = useState<{
    seq: number;
    type: PageTransitionEventType | null;
  }>({ seq: 0, type: null });
  const transitionSeqRef = useRef(0);

  const emitTransitionEvent = (type: PageTransitionEventType | null) => {
    transitionSeqRef.current += 1;
    setTransitionEvent({ seq: transitionSeqRef.current, type });
  };

  useLayoutEffect(() => {
    onControlsReady(entry.id, controls);
    return () => {
      onControlsReady(entry.id, null);
    };
  }, [entry.id, controls, onControlsReady]);

  useLayoutEffect(() => {
    const prev = prevSurfaceRef.current;
    prevSurfaceRef.current = surface;
    if (prev === surface) return;

    if (prev === null) {
      if (!animateOnMountRef.current || surface === "deeper") {
        settleSurface(controls, surface);
        return;
      }
      if (surface === "active") {
        if (enterMotion.initial !== false) {
          controls.set(enterMotion.initial);
        }
        emitTransitionEvent("enter");
        void controls.start(enterMotion.animate).then(() => {
          emitTransitionEvent("entered");
        });
        return;
      }
      settleSurface(controls, surface);
      return;
    }

    if (surface === "active") {
      if (prev === "underlay-parallax" || prev === "underlay-flat") {
        emitTransitionEvent("enter");
        void controls
          .start({
            x: 0,
            transition: { duration: exitSeconds, ease: ENTER_EASE },
          })
          .then(() => {
            emitTransitionEvent("entered");
          });
      } else {
        if (enterMotion.initial !== false) {
          controls.set(enterMotion.initial);
        }
        emitTransitionEvent("enter");
        void controls.start(enterMotion.animate).then(() => {
          emitTransitionEvent("entered");
        });
      }
      return;
    }

    if (prev === "active") {
      emitTransitionEvent("leave");
      if (surface === "underlay-parallax") {
        void controls
          .start({
            x: PARALLAX_X,
            transition: { duration: enterSeconds, ease: ENTER_EASE },
          })
          .then(() => {
            emitTransitionEvent("left");
          });
      } else if (surface === "underlay-flat") {
        void controls
          .start({
            x: 0,
            transition: { duration: enterSeconds, ease: ENTER_EASE },
          })
          .then(() => {
            emitTransitionEvent("left");
          });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface, controls, enterMotion, enterSeconds, exitSeconds]);

  const isActive = surface === "active";
  const visible = surface !== "deeper";
  // keepAlive=data 的页面非激活即卸载内容（仅 query 缓存保留），重激活时秒显+后台刷新
  const contentHidden = evicted || (keepAlive !== "keep" && !isActive);
  const zIndex =
    surface === "active"
      ? SCREEN_TOP
      : surface === "underlay-parallax" || surface === "underlay-flat"
        ? SCREEN_TOP - 1
        : SCREEN_BASE + layerIndex;

  const { navigator } = useRouterContext();
  const instanceValue = useMemo<PageInstanceContextValue>(
    () => ({
      entry,
      params: entry.params,
      navigator,
      phase: (isActive ? "active" : "paused") as PagePhase,
      transition: transitionEvent,
    }),
    // entry/navigator 引用稳定，phase 与转场流水变化才触发 context 消费者重渲染
    [entry, navigator, isActive, transitionEvent]
  );

  return (
    <Activity mode={visible ? "visible" : "hidden"}>
      <PageInstanceProvider value={instanceValue}>
        <motion.div
          initial={animateOnMount ? enterMotion.initial : false}
          animate={controls}
          exit={exitMotion.exit}
          inert={!isActive}
          aria-hidden={!isActive}
          data-page-entry-id={entry.id}
          data-page-key={entry.key}
          data-page-active={isActive ? "true" : "false"}
          className="fixed inset-0"
          style={{
            zIndex,
            pointerEvents: isActive ? undefined : "none",
          }}
        >
          {contentHidden ? null : (
            <PageStoreScope entry={entry}>{renderContent(entry)}</PageStoreScope>
          )}
        </motion.div>
      </PageInstanceProvider>
    </Activity>
  );
}

// 栈内保活页面的 LRU 上限，超出后卸载最久未访问页面的 DOM（数据留在 query 缓存）
const MAX_LIVE_SCREENS = 10;

export function PageHost({ rootContent }: { rootContent?: ReactNode }) {
  const { state, rootKey, navigator } = useRouterContext();
  const reducedMotion = useReducedMotion();
  const hasRenderedRef = useRef(false);
  const controlsMapRef = useRef(new Map<string, LayerAnimationControls>());
  const [evictedIds, setEvictedIds] = useState<Set<string>>(() => new Set());

  const { screens } = state;
  const topIndex = screens.entries.length - 1;
  const topEntry = screens.entries[topIndex] ?? null;
  const underlayEntry = screens.entries[topIndex - 1] ?? null;
  const activePreset = topEntry ? getPageMeta(topEntry.key)?.transition.preset : undefined;
  const parallaxTop = shouldParallaxUnderlay(activePreset);

  const handleControlsReady = useCallback((id: string, controls: LayerAnimationControls | null) => {
    if (controls) {
      controlsMapRef.current.set(id, controls);
    } else {
      controlsMapRef.current.delete(id);
    }
  }, []);

  useLayoutEffect(() => {
    hasRenderedRef.current = true;
  }, []);

  useEffect(() => {
    const keepEntries = screens.entries.filter(
      entry => entry.key !== rootKey && getPageMeta(entry.key)?.keepAlive === "keep"
    );
    const overflow = keepEntries.length - MAX_LIVE_SCREENS;
    const nextEvicted =
      overflow <= 0
        ? new Set<string>()
        : new Set(
            collectKeepAliveEvictionCandidates(
              { entries: keepEntries },
              () => true,
              new Set(
                [topEntry?.id, underlayEntry?.id].filter(
                  (id): id is string => typeof id === "string"
                )
              ),
              overflow
            )
          );
    setEvictedIds(prev => {
      if (prev.size === nextEvicted.size && [...nextEvicted].every(id => prev.has(id))) {
        return prev;
      }
      return nextEvicted;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screens.entries]);

  useEdgeBackGesture({
    enabled:
      screens.entries.length > 1 &&
      state.overlays.entries.length === 0 &&
      parallaxTop &&
      reducedMotion !== true,
    activeEntryId: topEntry?.id ?? null,
    underlayEntryId: underlayEntry?.id ?? null,
    controlsMap: controlsMapRef.current,
    onBack: () => navigator.goBack("gesture"),
  });

  const renderContent = (entry: RouteEntry): ReactNode => {
    if (entry.key === rootKey) {
      return rootContent;
    }
    const definition = getPageDefinition(entry.key);
    if (!definition) {
      console.warn(`[router] 页面 ${entry.key} 缺少组件定义`);
      return null;
    }
    const Component = definition.component;
    return <Component />;
  };

  return (
    <AnimatePresence>
      {screens.entries.map((entry, index) => {
        const surface: ScreenSurface =
          entry.id === topEntry?.id
            ? "active"
            : entry.id === underlayEntry?.id
              ? parallaxTop
                ? "underlay-parallax"
                : "underlay-flat"
              : "deeper";
        return (
          <PageLayer
            key={entry.id}
            entry={entry}
            layerIndex={index}
            surface={surface}
            evicted={evictedIds.has(entry.id)}
            keepAlive={getPageMeta(entry.key)?.keepAlive ?? "keep"}
            animateOnMount={hasRenderedRef.current}
            transition={
              getPageMeta(entry.key)?.transition ?? {
                preset: "none",
                enterMs: 0,
                exitMs: 0,
              }
            }
            onControlsReady={handleControlsReady}
            renderContent={renderContent}
          />
        );
      })}
    </AnimatePresence>
  );
}

export default PageHost;
