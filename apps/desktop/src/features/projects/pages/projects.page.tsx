/**
 * 项目 page 定义：key "projects" 与 navigation.ts 一致，真实注册自动接管侧边栏入口。
 */

import { definePage } from "@/page/definePage";
import { ProjectsView } from "../views/ProjectsView";

export default definePage({
  key: "projects",
  match: "single", // 列表页全局一份，重复进入原位激活
  label: "项目",
  status: "new",
  params: {},
  component: ProjectsView,
});
