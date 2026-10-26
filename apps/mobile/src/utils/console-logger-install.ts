// 劫持安装放在独立模块并作为 main.tsx 的首个 import：ES import 整体提升，
// 这样其余模块 import 期的 console 输出也能落盘
import { setupConsoleLogger } from "./console-logger";

setupConsoleLogger();
console.info("[app] 前端启动", navigator.userAgent);
