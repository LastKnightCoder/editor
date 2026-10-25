import cssText from "./style.css?inline";
import { mountCompanion } from "../../content/mount";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  runAt: "document_idle",
  cssInjectionMode: "manual",
  main(ctx) {
    // 只在普通 HTML 页面里挂（PDF 查看器、XML 等跳过）
    if (!(document.documentElement instanceof HTMLHtmlElement) || !document.body) return;
    const unmount = mountCompanion(cssText);
    ctx.onInvalidated(unmount);
  },
});
