// overlay 渲染层：overlay 页面与 screen 页面共用 definePage/生命周期/数据层，
// 仅渲染策略不同——overlay 组件自带容器形态（BottomSheet/Drawer 等）。
//
// 可见性规则：overlay 只在"最新 screen"之上时显示（按 createdAt 新旧判定）。
// 由此获得原生式下钻语义：preview 打开 contentDetail（更新的 screen）时
// overlay 自动隐藏但状态保留，返回后自动恢复，无需任何快照/恢复代码。

import { Activity } from "react";
import { getPageDefinition } from "./registry";
import { useRouterContext } from "./RouterProvider";
import { PageInstanceProvider } from "./pageLifecycle";
import type { PageInstanceContextValue } from "./pageLifecycle";
import { PageStoreScope } from "./store/PageStoreScope";

export function OverlayHost() {
  const { state, navigator } = useRouterContext();
  const { overlays, screens } = state;
  const topOverlayId = overlays.entries[overlays.entries.length - 1]?.id ?? null;
  const topScreenCreatedAt = screens.entries[screens.entries.length - 1]?.createdAt ?? 0;

  // 说明：overlay 组件自带容器形态与进出动画（BottomSheet/SnapSheet 等），
  // 这里不做外层 motion 转场（AnimatePresence 无 motion 子组件时不产生任何动画）
  return (
    <>
      {overlays.entries.map(entry => {
        const definition = getPageDefinition(entry.key);
        if (!definition) {
          console.warn(`[router] overlay ${entry.key} 缺少组件定义`);
          return null;
        }
        // 栈顶 overlay 且没有更新的 screen 盖在其上
        const isActive = entry.id === topOverlayId && entry.createdAt > topScreenCreatedAt;
        const instanceValue: PageInstanceContextValue = {
          entry,
          params: entry.params,
          navigator,
          phase: isActive ? "active" : "paused",
          transition: { seq: 0, type: null },
        };
        const Component = definition.component;
        return (
          <Activity key={entry.id} mode={isActive ? "visible" : "hidden"}>
            <PageInstanceProvider value={instanceValue}>
              <PageStoreScope entry={entry}>
                <div
                  data-overlay-entry-id={entry.id}
                  data-overlay-active={isActive ? "true" : "false"}
                  aria-hidden={!isActive}
                  inert={!isActive}
                  style={{
                    pointerEvents: isActive ? undefined : "none",
                  }}
                >
                  <Component />
                </div>
              </PageStoreScope>
            </PageInstanceProvider>
          </Activity>
        );
      })}
    </>
  );
}

export default OverlayHost;
