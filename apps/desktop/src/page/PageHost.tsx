/**
 * PageHost —— page 栈的保活渲染层（从移动端 PageHost.tsx 移植）。
 *
 * React 19.2 `<Activity mode="visible|hidden">`：非激活实例 state+DOM 保留、
 * effect 自动停驻——切页零丢失的核心。LRU 超限条目卸载（上限 MAX_LIVE_PAGES）。
 * 页面切换默认无转场（桌面即时感，蓝图 §3.7 取舍清单）；同一对象两页都在时由
 * PageProvider 走共享元素形变（morph.ts，D-106），按 data-page-id / data-page-active 定位页面。
 * 每页一个错误边界：单页渲染崩溃只替换该页内容区，侧栏 / 标题栏 / 其它保活页不受影响。
 */

import { Activity, useMemo } from "react";
import * as sm from "./core/stackMachine";
import { getPageDefinition } from "./registry";
import { PageParamsProvider, usePage } from "./PageProvider";
import { ErrorState, RecoverableBoundary } from "@/components/ErrorState";

export function PageHost({ state }: { state: sm.StackMachineState }) {
  const activeId = sm.current(state)?.id;

  // LRU：超出上限的实例不挂载（栈机弹出时组件随之销毁）。每次从当前栈态纯派生，
  // 不留跨渲染的驱除记录——栈收缩后富余出的保活名额自然恢复可用
  const visibleEntries = useMemo(() => {
    const evict = new Set(sm.lruEvict(state).map(e => e.id));
    return evict.size === 0 ? state.back : state.back.filter(e => !evict.has(e.id));
  }, [state]);

  return (
    <>
      {visibleEntries.map(entry => {
        const definition = getPageDefinition(entry.key);
        const isActive = entry.id === activeId;
        return (
          <div
            key={entry.id}
            data-page-key={entry.key}
            data-page-id={entry.id}
            data-page-active={isActive ? "" : undefined}
            aria-hidden={isActive ? undefined : true}
            // 高度链：h-full 让视图根的 h-full 生效（Loading 居中/视图内滚动/edge fade 都依赖）。
            // 非激活空壳不占布局：视图自带内部滚动时包装 div 会有显式高度，
            // 保活实例若留在流中会把 .content 撑出多余的滚动空间。
            // flow-root 建立 BFC 兜住视图根的外边距：否则根的 margin-top 折叠到包装上，
            // 把 h-full 包装整体下推，撑出壳层 main 的滚动条
            className={isActive ? "flow-root h-full" : undefined}
            style={isActive ? undefined : { display: "none" }}
          >
            <PageParamsProvider value={entry.params}>
              <Activity mode={isActive ? "visible" : "hidden"}>
                <RecoverableBoundary
                  resetKeys={[entry.params]}
                  fallback={({ error, reset }) => <PageErrorFallback error={error} reset={reset} />}
                >
                  {definition ? <definition.component /> : <MissingPageFallback />}
                </RecoverableBoundary>
              </Activity>
            </PageParamsProvider>
          </div>
        );
      })}
    </>
  );
}

function MissingPageFallback() {
  const { navigator } = usePage();
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
