// router 公共出口：页面开发者只需要从这里 import。

export { definePage } from "./definePage";
export type {
  PageDefinition,
  PageDefinitionArgs,
  PageDataEntry,
  PageDataDefinition,
  CanLeaveContext,
  PageQueryContext,
} from "./definePage";
export {
  number as paramNumber,
  string as paramString,
  boolean as paramBoolean,
  oneOf as paramOneOf,
  optional as paramOptional,
  object as paramObject,
} from "./core/paramsSchema";
export type { InferFields } from "./core/paramsSchema";
export { createPageSchema } from "./core/paramsSchema";
export { RouterProvider, useRouterContext, getNavigator } from "./RouterProvider";
export type { RouterContextValue } from "./RouterProvider";
export { PageHost } from "./PageHost";
export { OverlayHost } from "./OverlayHost";
export { usePage, useNavigator } from "./hooks";
export {
  usePageLifecycle,
  usePageGuard,
  useBackHandler,
  usePageInstanceContext,
} from "./pageLifecycle";
export type { PageLifecycleHandlers, PagePhase, PageTransitionEventType } from "./pageLifecycle";
export { useSheetBackDismiss } from "./useSheetBackDismiss";
export type { SheetBackDismissOptions } from "./useSheetBackDismiss";
export type { BackSource, Navigator, RouterState } from "./navigatorTypes";
export type { RouteEntry, StackSnapshot } from "./core/stackMachine";
export { switchTabScreen } from "./switchTab";
export { TAB_ORDER, isTabRoot, resolveTabNeighbor } from "./tabs";
export type { TabKey } from "./tabs";
export { useTabSwipeOrigin } from "./tabSwipeOrigin";
export { getPageDefinition, registerPageDefinition } from "./registry";

export { PageQueryProvider, getQueryClient, usePageQuery } from "./query/PageQueryProvider";
export { PageStoreScope, usePageStore, usePageStoreSetter } from "./store/PageStoreScope";
export { RouterDevTools } from "./devtools/RouterDevTools";
