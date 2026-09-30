/**
 * 番茄专注 page 定义：key "pomodoro" 与 navigation.ts 一致，真实注册接管侧边栏入口
 * （legacy.tsx 的占位注册同步删除）。小窗 / 沉浸窗是独立 Electron 窗口，走 router 辅助路由。
 */

import { definePage } from "@/page/definePage";
import { PomodoroView } from "../views/PomodoroView";

export default definePage({
  key: "pomodoro",
  match: "single",
  label: "番茄专注",
  params: {},
  component: PomodoroView,
});
