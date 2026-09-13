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
import { useTabSwipeGesture, type TabSwipeDirection } from "./tabSwipeGesture";
import { isTabRoot } from "./tabs";
import { setTabSwipeOrigin } from "./tabSwipeOrigin";
import { switchTabScreen } from "./switchTab";

type ScreenSurface =
  | "active"
  | "underlay-parallax"
  | "underlay-flat"
  /** tab 根做下层时完全移出屏外：tab 间切换为 pager 双页平移语义，不保留视差 */
  | "underlay-offscreen"
  | "deeper"
  /** tab 滑动跟手中的目标层：栈内提层（lift）或临时预览层（preview），位置由手势驱动 */
  | "gesture-target";

const PARALLAX_X = `${-SCREEN_PARALLAX_RATIO * 100}%`;
const OFFSCREEN_X = "-100%";
const ENTER_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
// popTo 由 history.go + 异步 popstate 恢复栈：超此时限仍未落定（被并发返回拒绝 /
// popstate 丢失）则按实时栈兜底恢复视觉，避免手势状态卡死
const SETTLE_TIMEOUT_MS = 800;

function settleSurface(controls: LayerAnimationControls, surface: ScreenSurface): void {
  if (surface === "active") {
    // x 用百分比字符串：与手势驱动的单位一致，避免 motion 在 %/px 间换算
    controls.set({ x: "0%", y: 0 });
  } else if (surface === "underlay-parallax") {
    controls.set({ x: PARALLAX_X });
  } else if (surface === "underlay-offscreen") {
    controls.set({ x: OFFSCREEN_X });
  } else if (surface === "underlay-flat") {
    controls.set({ x: "0%" });
  } else {
    // deeper 也复位：lift 目标层可能位于 deeper（栈内非 underlay 位），手势曾把它
    // 驱至屏外，取消/兜底收尾后须恢复固有几何，否则后续升层时残留屏外
    controls.set({ x: "0%", y: 0 });
  }
}

type PageLayerProps = {
  entry: RouteEntry;
  layerIndex: number;
  surface: ScreenSurface;
  /** 手势目标层的显式层级（lift/preview 按方向置于 active 上/下） */
  overrideZIndex?: number;
  /** gesture-target 挂载时的屏外起始位，此后由手势接管 */
  gestureInitialX?: string;
  /** 手势 popTo 落定：被卸载层已被拖至屏外，跳过 exit 转场立即移除 */
  suppressExit?: boolean;
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
  overrideZIndex,
  gestureInitialX,
  suppressExit,
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
  const gestureInitialXRef = useRef(gestureInitialX);
  gestureInitialXRef.current = gestureInitialX;
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
      if (surface === "gesture-target") {
        // 手势预览层：挂载即位于屏外起始位，后续由手势 set 接管
        controls.set({ x: gestureInitialXRef.current ?? "-100%" });
        return;
      }
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
      if (
        prev === "underlay-parallax" ||
        prev === "underlay-flat" ||
        prev === "underlay-offscreen" ||
        prev === "gesture-target"
      ) {
        // 含手势落定：从当前（跟手）位平滑归零，不重播 enter
        emitTransitionEvent("enter");
        void controls
          .start({
            x: "0%",
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

    if (prev === "gesture-target") {
      // 手势收尾回到非 active 层（取消回弹 / 兜底恢复）：恢复固有几何。此刻层在
      // 屏外或 origin 遮挡下不可见，复位无跳变；落定路径经 pendingSettle 等栈落定，
      // 不经过此分支（gesture-target → active 走上方零位移归位），无闪跳
      settleSurface(controls, surface);
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
      } else if (surface === "underlay-offscreen") {
        void controls
          .start({
            x: OFFSCREEN_X,
            transition: { duration: enterSeconds, ease: ENTER_EASE },
          })
          .then(() => {
            emitTransitionEvent("left");
          });
      } else if (surface === "underlay-flat") {
        void controls
          .start({
            x: "0%",
            transition: { duration: enterSeconds, ease: ENTER_EASE },
          })
          .then(() => {
            emitTransitionEvent("left");
          });
      }
      return;
    }

    if (
      prev === "deeper" &&
      (surface === "underlay-parallax" ||
        surface === "underlay-flat" ||
        surface === "underlay-offscreen")
    ) {
      // 从深层升为 underlay 时统一归位固有几何：deeper 期间的 x 不再有保证
      // （tab 滑动 lift 会驱动 deeper 层；此前靠"停留在上次 underlay 位置"的
      // 隐式约定，手势打破了它），归位发生在揭示转场起始帧，用户无感
      settleSurface(controls, surface);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface, controls, enterMotion, enterSeconds, exitSeconds]);

  const isActive = surface === "active";
  const visible = surface !== "deeper";
  // keepAlive=data 的页面非激活即卸载内容（仅 query 缓存保留），重激活时秒显+后台刷新；
  // 手势目标层（预览/lift）须保留内容——LRU 淘汰的空壳也不能被跟手拖出
  const contentHidden =
    surface !== "gesture-target" && (evicted || (keepAlive !== "keep" && !isActive));
  const zIndex =
    overrideZIndex ??
    (surface === "active"
      ? SCREEN_TOP
      : surface === "underlay-parallax" ||
          surface === "underlay-flat" ||
          surface === "underlay-offscreen"
        ? SCREEN_TOP - 1
        : SCREEN_BASE + layerIndex);

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
          exit={suppressExit ? undefined : exitMotion.exit}
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

// tab 滑动跟手状态：目标页在栈内则提层（lift）驱动既有实例（滚动位置保留）；
// 不在栈内则立即 push 预推入真实页面（屏外挂载、渲染为 gesture-target），
// 手势全程驱动同一实例，落定零交接（不重播内容入场动画/不重初始化虚拟列表）
type TabSwipeState = {
  targetKey: string;
  direction: TabSwipeDirection;
  /** 栈内目标：被提升跟手的 entry id；栈外目标为 null */
  liftedEntryId: string | null;
  /** engage 时的栈顶（push 预推入后不再位于栈顶，手势驱动/冻结都指向它） */
  originEntryId: string;
  /** engage 时栈顶的 key：push 预推入取消时 popTo 回原页 */
  originKey: string;
};

/** popTo 落定在途：栈顶回到 expectedTopKey 才清手势 */
type PendingSettle = {
  gesture: TabSwipeState;
  expectedTopKey: string;
};

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
  const topKey = topEntry?.key ?? null;
  const activeTabKey = topKey !== null && isTabRoot(topKey) ? topKey : null;
  // tab 根压着 tab 根：underlay 完全移出屏外（pager 语义），其余场景保留视差/平铺
  const tabOnTab = activeTabKey !== null && underlayEntry !== null && isTabRoot(underlayEntry.key);

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
    // tab 根压 tab 根时 underlay 在屏外：跟手按全宽 1:1 回位，与 tab 滑切观感一致
    underlayOffscreen: tabOnTab,
    onBack: () => navigator.goBack("gesture"),
  });

  // ---- tab 滑动跟手切换 ----

  const [tabSwipe, setTabSwipe] = useState<TabSwipeState | null>(null);
  const tabSwipeRef = useRef<TabSwipeState | null>(null);
  // 手势 popTo/pop 落定：被卸载层已被拖至屏外，exit 抑制（重播 exit 会反向横穿屏幕）
  const [suppressExitIds, setSuppressExitIds] = useState<Set<string>>(() => new Set());
  // popTo 经 history.go + 异步 popstate 恢复栈：发起后等栈顶到位才清手势，
  // 期间 origin 冻结 active / target 保持 gesture-target，surface 机制不会
  // 在落栈前制造"按 underlay 计算"的中间态（闪跳 / 错向 leave 的根源）
  const pendingSettleRef = useRef<PendingSettle | null>(null);
  const settleTimeoutRef = useRef<number | null>(null);

  const applyTabSwipe = (next: TabSwipeState | null) => {
    tabSwipeRef.current = next;
    setTabSwipe(next);
    // Dock 高亮在手势生命周期内以 origin 为准：push 预推入虽已同步改栈，
    // 切换语义要到落定才成立
    setTabSwipeOrigin(next?.originKey ?? null);
  };

  const clearSettleTimer = () => {
    if (settleTimeoutRef.current !== null) {
      window.clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    }
  };

  useEffect(() => () => clearSettleTimer(), []);

  /** popTo 未在时限内落定（被并发返回拒绝 / popstate 丢失）：按实时栈恢复视觉后强制清手势 */
  const armSettleWatchdog = (gesture: TabSwipeState) => {
    clearSettleTimer();
    settleTimeoutRef.current = window.setTimeout(() => {
      settleTimeoutRef.current = null;
      if (pendingSettleRef.current?.gesture !== gesture) return;
      pendingSettleRef.current = null;
      setSuppressExitIds(new Set());
      const entries = navigator.getScreenStack().entries;
      if (entries[entries.length - 1]?.id === gesture.originEntryId) {
        // popTo 完全未生效：origin 被 commit 补间拖至屏外且 surface 未变，须手动拉回；
        // lift 目标层交由 gesture-target 收尾分支恢复固有几何
        const spring = { type: "spring", stiffness: 420, damping: 38 } as const;
        controlsMapRef.current.get(gesture.originEntryId)?.start({ x: "0%", transition: spring });
      }
      // 否则 target 仍在栈顶（cancel 的 popTo 被拒）：清手势后按 active 拉回屏内，终态自洽
      applyTabSwipe(null);
    }, SETTLE_TIMEOUT_MS);
  };

  const engageTabSwipe = (targetKey: string, direction: TabSwipeDirection) => {
    const stackEntry = screens.entries.find(entry => entry.key === targetKey) ?? null;
    const liftedEntryId = stackEntry?.id ?? null;
    if (liftedEntryId) {
      // 先移到屏外起始位（next 从右、prev 从左；此刻仍被当前页遮挡，用户不可见）
      controlsMapRef.current.get(liftedEntryId)?.set({ x: `${direction * 100}%` });
    } else {
      // 预推入真实页面：渲染为 gesture-target（mount 抑制 enter、屏外起始位），
      // 与 lift 同一套驱动；取消时 pop 回原栈
      navigator.push(targetKey);
    }
    applyTabSwipe({
      targetKey,
      direction,
      liftedEntryId,
      originEntryId: topEntry?.id ?? "",
      originKey: topEntry?.key ?? rootKey,
    });
  };

  // push 预推入的 entry id 生成于异步 setState 之后，按 key 实时解析
  const resolveTargetEntryId = (gesture: TabSwipeState): string | null => {
    if (gesture.liftedEntryId) return gesture.liftedEntryId;
    return screens.entries.find(entry => entry.key === gesture.targetKey)?.id ?? null;
  };

  const moveTabSwipe = (progress: number) => {
    const gesture = tabSwipeRef.current;
    if (!gesture) return;
    const targetEntryId = resolveTargetEntryId(gesture);
    const targetControls = targetEntryId ? controlsMapRef.current.get(targetEntryId) : undefined;
    const originControls = controlsMapRef.current.get(gesture.originEntryId);
    // pager 双页同步：当前页沿 -direction 滑出，目标页从 direction 侧 1:1 跟进
    originControls?.set({ x: `${-gesture.direction * progress * 100}%` });
    targetControls?.set({ x: `${gesture.direction * (1 - progress) * 100}%` });
  };

  const commitTabSwipe = (progress: number) => {
    const gesture = tabSwipeRef.current;
    if (!gesture) return;
    const targetEntryId = resolveTargetEntryId(gesture);
    const targetControls = targetEntryId ? controlsMapRef.current.get(targetEntryId) : undefined;
    const originControls = controlsMapRef.current.get(gesture.originEntryId);
    const remaining = Math.max(1 - progress, 0.05);
    const settle = { duration: Math.max(remaining * 0.25, 0.08), ease: ENTER_EASE };
    const originOffscreenX = gesture.direction === 1 ? "-100%" : "100%";
    const targetAnim = targetControls?.start({ x: "0%", transition: settle });
    const originAnim = originControls?.start({ x: originOffscreenX, transition: settle });

    // 补间先把两页送到位（gesture-target 层仍在渲染、controls 有效），完成后才落定：
    // push 场景手势清掉即 surface 归位（同实例零交接）；popTo 场景等异步栈落定后清
    void Promise.all([targetAnim, originAnim].filter(Boolean)).then(() => {
      if (tabSwipeRef.current !== gesture) return;
      const entries = navigator.getScreenStack().entries;
      if (!gesture.liftedEntryId) {
        // push 落定（栈变化是同步的）：补间期间程序性返回可能已弹掉预推入层，
        // 校验失败时回弹 origin，避免栈顶页停在屏外
        if (entries[entries.length - 1]?.key !== gesture.targetKey) {
          const spring = { type: "spring", stiffness: 420, damping: 38 } as const;
          void originControls?.start({ x: "0%", transition: spring });
          applyTabSwipe(null);
          return;
        }
        applyTabSwipe(null);
        return;
      }
      // popTo 落定：被卸载层已在屏外，exit 抑制（重播会反向横穿屏幕）；
      // 补间耗时约 150ms，期间栈可能被程序性操作改变，取实时栈计算被卸载层
      const targetIndex = entries.findIndex(entry => entry.key === gesture.targetKey);
      if (targetIndex < 0) {
        applyTabSwipe(null);
        return;
      }
      setSuppressExitIds(new Set(entries.slice(targetIndex + 1).map(entry => entry.id)));
      switchTabScreen(navigator, gesture.targetKey);
      pendingSettleRef.current = { gesture, expectedTopKey: gesture.targetKey };
      armSettleWatchdog(gesture);
    });
  };

  const cancelTabSwipe = () => {
    const gesture = tabSwipeRef.current;
    if (!gesture) return;
    const targetEntryId = resolveTargetEntryId(gesture);
    const targetControls = targetEntryId ? controlsMapRef.current.get(targetEntryId) : undefined;
    const originControls = controlsMapRef.current.get(gesture.originEntryId);
    const spring = { type: "spring", stiffness: 420, damping: 38 } as const;
    void originControls?.start({ x: "0%", transition: spring });
    // targetControls 缺失（极端时序下预推入层尚未注册 controls）也走收尾链兜底：
    // popTo 对已是栈顶的 originKey 是 no-op，pendingSettle 随即确认并清手势
    const targetAnim =
      targetControls?.start({ x: `${gesture.direction * 100}%`, transition: spring }) ??
      Promise.resolve();
    void targetAnim.then(() => {
      // 回弹播完且期间未开始新手势才收尾，避免半途卸载闪断
      if (tabSwipeRef.current !== gesture) return;
      if (!gesture.liftedEntryId) {
        // 预推入的页面弹回屏外后 pop 回原栈（exit 抑制，立即移除）；
        // popTo 异步恢复，等栈顶回到 origin 再清手势（见 pendingSettle effect）
        if (targetEntryId) {
          setSuppressExitIds(new Set([targetEntryId]));
        }
        navigator.popTo(gesture.originKey);
        pendingSettleRef.current = { gesture, expectedTopKey: gesture.originKey };
        armSettleWatchdog(gesture);
        return;
      }
      applyTabSwipe(null);
    });
  };

  useTabSwipeGesture({
    enabled:
      activeTabKey !== null &&
      state.overlays.entries.length === 0 &&
      reducedMotion !== true &&
      // 手势进行中 / 落定补间 / 等待 popTo 落栈期间拒绝新触摸，防止旧层半途被卸载闪断
      tabSwipe === null,
    activeTabKey,
    edgeBackEnabled: screens.entries.length > 1 && parallaxTop,
    onEngage: engageTabSwipe,
    onMove: moveTabSwipe,
    onCommit: commitTabSwipe,
    onCancel: cancelTabSwipe,
  });

  // popTo 落定确认：栈顶到期望 key 才清手势（origin 冻结 / target 屏外保持到此刻）
  useEffect(() => {
    const pending = pendingSettleRef.current;
    if (!pending || tabSwipeRef.current !== pending.gesture) return;
    if (screens.entries[screens.entries.length - 1]?.key === pending.expectedTopKey) {
      pendingSettleRef.current = null;
      clearSettleTimer();
      applyTabSwipe(null);
    }
  }, [screens.entries]);

  useLayoutEffect(() => {
    if (suppressExitIds.size === 0) return;
    // 抑制标记须存活到 popstate 恢复栈、层真正卸载的那一帧（popTo 异步落栈，
    // 卸载渲染晚于发起渲染）：只清已离栈的 id，整组清空会让 exit 重播反向横穿
    const alive = new Set(
      screens.entries.filter(entry => suppressExitIds.has(entry.id)).map(entry => entry.id)
    );
    if (alive.size === suppressExitIds.size) return;
    setSuppressExitIds(alive);
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

  // 手势活跃时两类特殊层：目标层（lift 提层或 push 预推入的栈顶）与 origin
  // （push 后原栈顶冻结为 active，避免 underlay 转场方向与拖拽相反）
  const gestureActive = tabSwipe !== null;
  const gestureTargetKey = tabSwipe && !tabSwipe.liftedEntryId ? tabSwipe.targetKey : null;
  const gestureLayerZ = tabSwipe?.direction === 1 ? SCREEN_TOP + 1 : SCREEN_TOP - 1;

  return (
    <AnimatePresence>
      {screens.entries.map((entry, index) => {
        const isGestureTarget =
          gestureActive &&
          ((gestureTargetKey !== null && entry.key === gestureTargetKey) ||
            tabSwipe?.liftedEntryId === entry.id);
        const isFrozenOrigin =
          gestureActive && gestureTargetKey !== null && entry.id === tabSwipe?.originEntryId;
        const surface: ScreenSurface = isGestureTarget
          ? "gesture-target"
          : isFrozenOrigin
            ? "active"
            : entry.id === topEntry?.id
              ? "active"
              : entry.id === underlayEntry?.id
                ? tabOnTab
                  ? "underlay-offscreen"
                  : parallaxTop
                    ? "underlay-parallax"
                    : "underlay-flat"
                : "deeper";
        const isUnderlaySurface =
          surface === "underlay-parallax" ||
          surface === "underlay-flat" ||
          surface === "underlay-offscreen";
        return (
          <PageLayer
            key={entry.id}
            entry={entry}
            layerIndex={index}
            surface={surface}
            overrideZIndex={
              isGestureTarget
                ? gestureLayerZ
                : isFrozenOrigin && tabSwipe?.direction === -1
                  ? // prev：origin 滑出中须盖在预推入的新页之上
                    SCREEN_TOP + 1
                  : gestureActive && isUnderlaySurface
                    ? // 手势期 underlay 压低一档：direction=-1 的 lift 目标层
                      // （SCREEN_TOP-1）不能与 underlay 撞值，否则遮挡退化为 DOM 顺序
                      SCREEN_TOP - 2
                    : undefined
            }
            gestureInitialX={
              isGestureTarget && gestureTargetKey !== null
                ? `${tabSwipe!.direction * 100}%`
                : undefined
            }
            suppressExit={suppressExitIds.has(entry.id)}
            evicted={evictedIds.has(entry.id)}
            keepAlive={getPageMeta(entry.key)?.keepAlive ?? "keep"}
            animateOnMount={
              hasRenderedRef.current && !(isGestureTarget && gestureTargetKey !== null)
            }
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
