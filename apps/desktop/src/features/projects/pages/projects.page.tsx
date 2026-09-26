/**
 * 项目 page 定义：key "projects" 与 navigation.ts 一致，真实注册自动接管侧边栏入口。
 * id = 类型筛选（侧栏子项，项目类型值，空 = 全部），切换经栈机原位更新参数，不堆历史。
 */

import { createPageSchema, paramOptional, paramString } from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { ProjectsView } from "../views/ProjectsView";

const schema = createPageSchema({
  id: paramOptional(paramString()),
});

export default definePage({
  key: "projects",
  match: "single", // 列表页全局一份，重复进入原位激活
  label: "项目",
  status: "new",
  params: schema.schema,
  component: ProjectsView,
});
