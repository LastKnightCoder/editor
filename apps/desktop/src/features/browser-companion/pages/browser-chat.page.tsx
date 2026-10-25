import { definePage } from "@/page/definePage";
import { createPageSchema, paramString } from "@/page/core/paramsSchema";
import { BrowserChatView } from "../views/BrowserChatView";

/** 网页对话（只读）：浏览器伴读里的一段对话，在 Tau 里看完整的工具卡片 */
const schema = createPageSchema({
  url: paramString(),
  session: paramString(),
});

export default definePage({
  key: "browser-chat",
  match: "params",
  getId: params => params.session,
  label: "网页对话",
  params: schema.schema,
  component: BrowserChatView,
});
