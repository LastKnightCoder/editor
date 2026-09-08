import { setupConsoleLogger } from "@/utils/console-logger";

// console 劫持需最先安装，尽量捕获其余模块 import 期的日志输出
setupConsoleLogger();

window.global ||= window;

// 允许 class="allow-tab" 的元素保持可聚焦
document.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === "Tab" && e.target instanceof HTMLElement && !e.target.matches(".allow-tab")) {
    e.preventDefault();
  }
});
