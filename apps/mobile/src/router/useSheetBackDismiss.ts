// 页内浮层的返回手势接入：浮层打开时消费返回（仅关闭浮层不弹页面栈）。
//
// 语义约定：
// - 注册时序 = 打开时序（open 变 true 才注册），配合 router 的 LIFO 仲裁，
//   多浮层叠加时"最近打开的先关"，嵌套场景（页面 → 内层浮层）由内向外退让；
// - 可在任意宿主使用：页面树外（rootContent/AppDock 等无 PageInstanceContext 的
//   场景）静默跳过，行为退化为不拦截；
// - 通用容器组件（BottomSheet/ActionSheet/SnapSheet/MobileConfirmDialog）已内置
//   本 hook，业务通常无需直接调用——仅自建浮层或需要 confirm 拦截时使用；
// - 有状态保活/结果回传/深链需求的浮层应升级为 layer: "overlay" 的路由页
//   （决策树见 docs/移动端页面栈与返回策略.md）。

import { useEffect, useRef } from "react";
import { useOptionalPageInstanceContext } from "./pageLifecycle";

export type SheetBackDismissOptions = {
  /**
   * 关闭前确认（未保存提醒等）：返回 false 吞掉本次返回、保留浮层。
   * 确认 UI（对话框等）由调用方自行呈现。
   */
  confirm?: () => boolean | Promise<boolean>;
};

export function useSheetBackDismiss(
  open: boolean,
  dismiss: () => void,
  options?: SheetBackDismissOptions
): void {
  const ctx = useOptionalPageInstanceContext();
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  const confirmRef = useRef(options?.confirm);
  confirmRef.current = options?.confirm;
  const entryId = ctx?.entry.id ?? null;

  useEffect(() => {
    if (!open || entryId === null) return;
    // ctx 为渲染期字面量（引用不稳定），但 navigator 引用稳定，此处按 entryId 对齐
    // 与 useBackHandler 相同的依赖策略
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // 打开期间必定消费返回：边缘返回手势不拖动页面（拖出后只会弹回）
    return ctx!.navigator.registerBackHandler(
      entryId,
      async () => {
        if (confirmRef.current && !(await confirmRef.current())) return true;
        dismissRef.current();
        return true;
      },
      { blockEdgeBack: true }
    );
  }, [open, entryId]);
}
