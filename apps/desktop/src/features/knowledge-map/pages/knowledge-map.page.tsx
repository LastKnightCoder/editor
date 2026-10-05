/**
 * 知识地图 page：全局视角，入口在标题栏（D-095），不进侧边栏。
 * focus = 打开时对准的节点键（如 "card:12"），从某篇内容里进入时带上。
 * insight = 打开时直接进入洞见视图并点亮的那一处（今日页「洞见」卡的「去看看」）：
 * "global:<标记 id>"、"topic:<主题 id>" 或 "topic:<主题 id>:<标记 id>"。
 */

import { createPageSchema, paramOptional, paramString } from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { KnowledgeMapView } from "../views/KnowledgeMapView";

const schema = createPageSchema({
  focus: paramOptional(paramString()),
  insight: paramOptional(paramString()),
});

export default definePage({
  key: "knowledge-map",
  match: "single", // 全局一份，从不同内容进入时原位更新 focus
  label: "知识地图",
  params: schema.schema,
  component: KnowledgeMapView,
});
