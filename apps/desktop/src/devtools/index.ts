/**
 * 开发工具入口：只由 AppShell 在开发构建里懒加载。
 * 加载即注册内置操作；其他功能也可以自行 registerDevAction。
 */

import { registerBuiltinDevActions } from "./actions";

registerBuiltinDevActions();

export { DevFloatingBall } from "./DevFloatingBall";
export { registerDevAction, type DevAction } from "./registry";
