import { createRoot } from "react-dom/client";
import katexCss from "katex/dist/katex.min.css?raw";
import { CompanionController } from "./state/controller";
import { ControllerContext } from "./ui/context";
import { App } from "./ui/App";

const HOST_TAG = "tau-companion";
const DOCUMENT_STYLE_ID = "tau-companion-document";

/** 网页可能改了根字号，rem 一律按 16px 换算成 px */
export const remToPx = (css: string) =>
  css.replace(
    /(-?\d*\.?\d+)rem\b/g,
    (_, value: string) => `${Number((Number(value) * 16).toFixed(4))}px`
  );

/**
 * 把为文档写的样式改成 shadow root 可用：:root → :host；@property 与 @font-face 在 shadow root 里不生效，
 * 拆出来注入页面文档。字体地址经 fontUrl 改写（KaTeX 字体是扩展资源）。
 */
export function splitShadowCss(
  css: string,
  fontUrl: (file: string) => string = file => file
): { shadow: string; document: string } {
  const documentRules: string[] = [];
  const shadow = css.replace(/@(property|font-face)\s*[^{]*\{[^}]*\}/g, rule => {
    documentRules.push(
      rule.startsWith("@font-face")
        ? rule.replace(/src:[^;}]*/, src => {
            const woff2 = src.match(/url\(["']?fonts\/([^"')]+\.woff2)["']?\)/);
            return woff2 ? `src:url(${fontUrl(woff2[1])}) format("woff2")` : src;
          })
        : rule
    );
    return "";
  });
  return {
    shadow: remToPx(shadow.replace(/:root\b/g, ":host")),
    document: documentRules.join("\n"),
  };
}

export function mountCompanion(cssText: string): () => void {
  if (document.querySelector(HOST_TAG)) return () => {};
  const host = document.createElement(HOST_TAG);
  host.style.cssText =
    "all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483646;";
  const shadow = host.attachShadow({ mode: "closed" });
  const { shadow: shadowCss, document: documentCss } = splitShadowCss(
    `${cssText}\n${katexCss}`,
    file => chrome.runtime.getURL(`/katex/fonts/${file}` as "/katex/fonts/x.woff2")
  );
  const style = document.createElement("style");
  style.textContent = shadowCss;
  shadow.append(style);
  if (documentCss && !document.getElementById(DOCUMENT_STYLE_ID)) {
    const documentStyle = document.createElement("style");
    documentStyle.id = DOCUMENT_STYLE_ID;
    documentStyle.textContent = documentCss;
    (document.head ?? document.documentElement).append(documentStyle);
  }
  const container = document.createElement("div");
  shadow.append(container);
  document.documentElement.append(host);

  const controller = new CompanionController(host);
  const root = createRoot(container);
  root.render(
    <ControllerContext.Provider value={controller}>
      <App />
    </ControllerContext.Provider>
  );
  void controller.start();
  return () => {
    root.unmount();
    controller.dispose();
    host.remove();
  };
}
