// navigator 命令对象接口：组件内经 useRouter() 获取，组件外经 getNavigator() 获取。

import type { RouteEntry, StackSnapshot } from "./core/stackMachine";

export type BackSource = "android" | "gesture" | "popstate" | "ui" | "code";

export type PageToast = {
  type: "info" | "error" | "success";
  text: string;
} | null;

export type PendingSettle =
  | { status: "fulfilled"; value: unknown }
  | { status: "rejected"; reason: "dismissed" | "caller-dismissed" };

export type Navigator = {
  /** 压入页面（按页面声明的 match 策略去重/复用） */
  push(key: string, params?: Record<string, unknown>): void;
  /**
   * 预加载：按页面 data 声明预取 query 缓存（不挂载组件）。
   * 高概率跳转的页面（如首页→详情）提前调用，push 后数据秒显。
   */
  preload(key: string, params?: Record<string, unknown>): Promise<void>;
  /** 原子替换当前顶部路由（支持 overlay 与 screen 跨层替换） */
  replace(key: string, params?: Record<string, unknown>): void;
  /** 返回上一层。result 供 pushForResult 的调用方接收 */
  pop(result?: unknown): void;
  /** 弹到指定 key 的最近实例（含） */
  popTo(key: string): void;
  /** 弹到根页 */
  popToTop(): void;
  /** push 并等待页面 finish(result)/cancel；未 finish 返回（手势/系统键）则 reject */
  pushForResult<R = unknown>(key: string, params?: Record<string, unknown>): Promise<R>;
  /** 被打开的页面提交结果并关闭 */
  finish(result?: unknown): void;
  /** 被打开的页面取消并关闭 */
  cancel(): void;
  /** 系统返回/UI 返回统一入口（overlay 优先 → 守卫 → 根页策略）；返回是否驱动了回退 */
  goBack(source: BackSource): Promise<boolean>;
  canGoBack(): boolean;
  /** 页面实例注册动态离开守卫（usePageGuard 内部使用） */
  registerGuard(entryId: string, guard: (() => boolean | Promise<boolean>) | null): void;
  /**
   * 页面实例注册返回消费器（useBackHandler 内部使用）：返回 true 表示已消费本次返回。
   * 同一页面可注册多个（页内多浮层叠加），仲裁按 LIFO——后注册（更上层浮层）先问；
   * 返回注销函数，精确移除自身而不影响同页其它消费器。
   */
  registerBackHandler(entryId: string, handler: () => boolean | Promise<boolean>): () => void;
  getScreenStack(): StackSnapshot;
  getOverlayStack(): StackSnapshot;
  getActiveScreen(): RouteEntry | null;
  getTopOverlay(): RouteEntry | null;
};

export type RouterState = {
  screens: StackSnapshot;
  overlays: StackSnapshot;
  toast: PageToast;
};
