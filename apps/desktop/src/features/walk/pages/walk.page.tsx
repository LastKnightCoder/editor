/**
 * 漫步 page 定义：key "walk" 与 navigation.ts 一致，接管侧边栏入口。
 * from = 「kind:id」（今日页牌堆「继续走」入口），single 页异参原位更新：
 * from 变化时视图以该条为新起点重开足迹。
 */

import { createPageSchema, paramOptional, paramString } from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { WalkView } from "../views/WalkView";

const schema = createPageSchema({
  from: paramOptional(paramString()),
});

export default definePage({
  key: "walk",
  match: "single",
  label: "漫步",
  params: schema.schema,
  component: WalkView,
});
