/**
 * 闪卡复习 page 定义：key "review" 与 navigation.ts 一致，真实注册自动接管侧边栏入口
 * （legacy.tsx 的占位注册同步删除）。
 * deckId = 外部定位到某个卡组（今日页复习卡等入口），进入后选中该卡组，参数随即消费掉。
 */

import { createPageSchema, paramNumber, paramOptional } from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { FlashcardsView } from "../views/FlashcardsView";

const schema = createPageSchema({
  deckId: paramOptional(paramNumber()),
});

export default definePage({
  key: "review",
  match: "single",
  label: "闪卡复习",
  params: schema.schema,
  component: FlashcardsView,
});
