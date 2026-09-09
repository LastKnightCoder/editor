// L5 开发者 hooks：页面组件内获取导航能力与自身参数。

import { useRouterContext } from "./RouterProvider";
import { usePageInstanceContext } from "./pageLifecycle";
import type { Navigator } from "./navigatorTypes";

/** 页面组件外（任意位置）获取 navigator */
export function useNavigator(): Navigator {
  return useRouterContext().navigator;
}

/**
 * 页面组件内使用：获取强类型参数与 navigator。
 * 泛型 P 由调用方传入（迁移期由 pages.ts 的类型映射统一收窄）。
 */
export function usePage<P extends Record<string, unknown> = Record<string, unknown>>(): {
  params: P;
  navigator: Navigator;
  entryId: string;
} {
  const ctx = usePageInstanceContext();
  return {
    params: ctx.params as P,
    navigator: ctx.navigator,
    entryId: ctx.entry.id,
  };
}
