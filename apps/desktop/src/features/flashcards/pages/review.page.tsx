import { appMessages } from "@/app/i18n/messages";
/**
 * 闪卡复习 page 定义：key "review" 与 navigation.ts 一致，真实注册自动接管侧边栏入口
 * （legacy.tsx 的占位注册同步删除）。
 * deckId = 外部定位到某个卡组（今日页复习卡等入口），进入后选中该卡组，参数随即消费掉。
 * cardId = 定位并打开一张闪卡，进入后消费。
 */

import { createPageSchema, paramNumber, paramOptional } from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { FlashcardsView } from "../views/FlashcardsView";

const schema = createPageSchema({
  deckId: paramOptional(paramNumber()),
  cardId: paramOptional(paramNumber()),
});

export default definePage({
  key: "review",
  match: "single",
  label: appMessages.ref("nav.review"),
  params: schema.schema,
  component: FlashcardsView,
});
