/**
 * Notebook 列表 page：key "vibe-learning" 与 navigation.ts 一致，注册后接管侧边栏入口。
 * 对外名为 Notebook（仿 NotebookLM），page key / 表名 / IPC 频道沿用 vibe-learning 不改名。
 */

import { createPageSchema } from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { VibeLearningListView } from "../views/VibeLearningListView";

const schema = createPageSchema({});

export default definePage({
  key: "vibe-learning",
  match: "single", // 列表页全局一份，重复进入原位激活
  label: "Notebook",
  params: schema.schema,
  component: VibeLearningListView,
});
