/**
 * PageHost —— page 栈的保活渲染层（从移动端 PageHost.tsx 移植）。
 *
 * React 19.2 `<Activity mode="visible|hidden">`：非激活实例 state+DOM 保留、
 * effect 隐藏时清理。文档页重新绑定正文并恢复阅读位置后才交接展示。
 * LRU 超限条目卸载（上限 MAX_LIVE_PAGES）。
 * 页面切换默认无转场（桌面即时感，蓝图 §3.7 取舍清单）；同一对象两页都在时由
 * PageProvider 走共享元素形变（morph.ts），按 data-page-id / data-page-active 定位页面。
 * 每页一个错误边界：单页渲染崩溃只替换该页内容区，侧栏 / 标题栏 / 其它保活页不受影响。
 */

import {
  Activity,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { setPerfPageContext } from "@/utils/perf-trace";
import * as sm from "./core/stackMachine";
import { getPageDefinition } from "./registry";
import { PageParamsProvider, usePage } from "./PageProvider";
import { ErrorState, RecoverableBoundary } from "@/components/ErrorState";
import { PageViewport, PageViewportContext } from "./viewport";

export function PageHost({ state }: { state: sm.StackMachineState }) {
  const activeId = sm.current(state)?.id;
  const active = sm.current(state);
  const [presented, setPresented] = useState(active);
  const [, refresh] = useReducer(value => value + 1, 0);
  const viewports = useRef(new Map<string, PageViewport>());
  const viewportFor = (entry: sm.PageEntry) => {
    let viewport = viewports.current.get(entry.id);
    if (!viewport) {
      viewport = new PageViewport(entry.params, refresh);
      viewports.current.set(entry.id, viewport);
    }
    viewport.updateParams(entry.params);
    return viewport;
  };
  const preparing = Boolean(
    active && presented && active.id !== presented.id && viewportFor(active).restoring
  );
  const shown = preparing ? presented : active;

  useLayoutEffect(() => {
    if (!preparing) return;
    document.documentElement.dataset.pageRestoring = "";
    return () => {
      delete document.documentElement.dataset.pageRestoring;
    };
  }, [preparing]);

  // LRU：超出上限的实例不挂载（栈机弹出时组件随之销毁）。每次从当前栈态纯派生，
  // 不留跨渲染的驱除记录——栈收缩后富余出的保活名额自然恢复可用
  const visibleEntries = useMemo(() => {
    const evict = new Set(sm.lruEvict(state).map(e => e.id));
    return evict.size === 0 ? state.back : state.back.filter(e => !evict.has(e.id));
  }, [state]);

  useLayoutEffect(() => {
    if (shown !== presented) setPresented(shown);
    const retained = new Set([...state.back, ...state.forward].map(entry => entry.id));
    if (shown) retained.add(shown.id);
    for (const id of viewports.current.keys()) {
      if (!retained.has(id)) viewports.current.delete(id);
    }
  }, [presented, shown, state]);

  useEffect(() => {
    setPerfPageContext({
      pageKey: active?.key,
      pageId: active?.id,
      livePageCount: visibleEntries.length,
    });
  }, [active?.key, active?.id, visibleEntries.length]);

  return (
    <>
      {(shown && !visibleEntries.some(entry => entry.id === shown.id)
        ? [...visibleEntries, shown]
        : visibleEntries
      ).map(entry => {
        const definition = getPageDefinition(entry.key);
        const isActive = entry.id === activeId;
        return (
          <PageFrame
            key={entry.id}
            entry={entry}
            active={isActive}
            presented={entry.id === shown?.id}
            viewport={viewportFor(entry)}
          >
            <PageParamsProvider value={entry.params}>
              <Activity mode={isActive || entry.id === shown?.id ? "visible" : "hidden"}>
                <PageViewportContext.Provider value={viewportFor(entry)}>
                  <RecoverableBoundary
                    resetKeys={[entry.params]}
                    fallback={({ error, reset }) => (
                      <PageErrorFallback error={error} reset={reset} />
                    )}
                  >
                    {definition ? <definition.component /> : <MissingPageFallback />}
                  </RecoverableBoundary>
                </PageViewportContext.Provider>
              </Activity>
            </PageParamsProvider>
          </PageFrame>
        );
      })}
    </>
  );
}

function PageFrame({
  entry,
  active,
  presented,
  viewport,
  children,
}: {
  entry: sm.PageEntry;
  active: boolean;
  presented: boolean;
  viewport: PageViewport;
  children: ReactNode;
}) {
  const { registerPageCapture } = usePage();
  const setElement = useCallback(
    (element: HTMLDivElement | null) => {
      viewport.element = element;
    },
    [viewport]
  );
  viewport.active = active;
  useLayoutEffect(
    () => registerPageCapture(entry.id, viewport.capture),
    [entry.id, registerPageCapture, viewport]
  );
  const retained = presented && !active;
  return (
    <div
      ref={setElement}
      data-page-key={entry.key}
      data-page-id={entry.id}
      data-page-active={presented ? "" : undefined}
      data-page-preparing={active && !presented ? "" : undefined}
      aria-hidden={presented ? undefined : true}
      inert={!presented || retained}
      // BFC 兜住根视图的外边距；准备中的正文有完整布局，但不能提前露出 Loading 或文首。
      className={
        active || presented
          ? `flow-root h-full${!presented ? " invisible" : ""}${retained ? " [&_*]:[view-transition-name:none]" : ""}`
          : undefined
      }
      style={
        retained
          ? { position: "fixed", zIndex: 40, ...viewport.bounds }
          : active
            ? undefined
            : { display: "none" }
      }
    >
      {children}
    </div>
  );
}

function MissingPageFallback() {
  const { navigator } = usePage();
  const viewport = useContext(PageViewportContext);
  useLayoutEffect(() => viewport?.cancel(), [viewport]);
  return (
    <ErrorState
      title="页面暂时无法打开"
      description="可以返回上一页，或回到今日后重试。"
      actions={[
        ...(navigator.canBack() ? [{ label: "返回上一页", onClick: () => navigator.back() }] : []),
        { label: "回到今日", onClick: () => navigator.push("home") },
      ]}
    />
  );
}

function PageErrorFallback({ error, reset }: { error: unknown; reset: () => void }) {
  const { navigator } = usePage();
  const viewport = useContext(PageViewportContext);
  useLayoutEffect(() => viewport?.cancel(), [viewport]);
  return (
    <ErrorState
      error={error}
      title="这个页面出错了"
      description="页面渲染时发生了意外错误，其它页面不受影响。可以重试，或先去别处继续工作。"
      actions={[
        { label: "重试", onClick: reset },
        navigator.canBack()
          ? { label: "返回上一页", onClick: () => navigator.back() }
          : { label: "回到今日", onClick: () => navigator.push("home") },
      ]}
    />
  );
}
