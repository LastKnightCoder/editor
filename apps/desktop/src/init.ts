import { setupConsoleLogger } from "@/utils/console-logger";
import { startPerfObserver } from "@/utils/perf-observer";
import { startImageCapabilities } from "@/services/image-capabilities";

// console 劫持需最先安装，尽量捕获其余模块 import 期的日志输出
setupConsoleLogger();
// 卡顿诊断采集随启动安装，覆盖完整使用时段（非 Electron 环境内部自动跳过）
startPerfObserver();
const stopImageCapabilities = startImageCapabilities();
if (import.meta.hot) import.meta.hot.dispose(stopImageCapabilities);

window.global ||= window;

// 允许 class="allow-tab" 的元素保持可聚焦
document.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === "Tab" && e.target instanceof HTMLElement && !e.target.matches(".allow-tab")) {
    e.preventDefault();
  }
});
