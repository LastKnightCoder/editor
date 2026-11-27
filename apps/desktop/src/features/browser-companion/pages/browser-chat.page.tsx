import { definePage } from "@/page/definePage";
import { createPageSchema, paramString } from "@/page/core/paramsSchema";
import { appMessages } from "@/app/i18n/messages";
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
  label: appMessages.ref("page.browserChat"),
  params: schema.schema,
  component: BrowserChatView,
});
