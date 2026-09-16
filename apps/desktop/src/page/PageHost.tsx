/**
 * PageHost —— page 栈的保活渲染层（从移动端 PageHost.tsx 移植）。
 *
 * React 19.2 `<Activity mode="visible|hidden">`：非激活实例 state+DOM 保留、
 * effect 自动停驻——切页零丢失的核心。LRU 超限条目卸载（上限 MAX_LIVE_PAGES）。
 * 页面切换无转场（桌面即时感，蓝图 §3.7 取舍清单）。
 */

import { Activity, useMemo } from "react";
import * as sm from "./core/stackMachine";
import { getPageDefinition } from "./registry";
import { LegacyPendingPage } from "./LegacyPendingPage";

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
            aria-hidden={isActive ? undefined : true}
            // 非激活空壳不占布局：视图自带内部滚动时包装 div 会有显式高度，
            // 保活实例若留在流中会把 .content 撑出多余的滚动空间
            style={isActive ? undefined : { display: "none" }}
          >
            <Activity mode={isActive ? "visible" : "hidden"}>
              {definition ? <definition.component /> : <LegacyPendingPage pageKey={entry.key} />}
            </Activity>
          </div>
        );
      })}
    </>
  );
}
