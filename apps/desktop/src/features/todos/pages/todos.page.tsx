/**
 * 待办 page 定义：key "todos" 与 navigation.ts 一致，真实注册自动接管侧边栏入口
 * （legacy.tsx 的占位注册同步删除）。独立页，不并入日程（D-039）。
 */

import { definePage } from "@/page/definePage";
import { TodosView } from "../views/TodosView";

export default definePage({
  key: "todos",
  match: "single",
  label: "待办",
  status: "new",
  params: {},
  component: TodosView,
});
