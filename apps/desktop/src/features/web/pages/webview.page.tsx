import { definePage } from "@/page/definePage";
import { createPageSchema, paramString } from "@/page/core/paramsSchema";
import { WebView } from "../views/WebView";

const schema = createPageSchema({ url: paramString() });

export default definePage({
  key: "webview",
  match: "params",
  getId: params => params.url,
  label: "网页",
  params: schema.schema,
  component: WebView,
});
