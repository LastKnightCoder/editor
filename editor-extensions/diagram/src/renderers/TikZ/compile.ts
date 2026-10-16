import compilerUrl from "./tikzjax.js?url";
import fontCss from "./tikz.vendor.css?raw";

/** 单次编译拥有独立 DOM 与 Worker，销毁 iframe 同时终止编译上下文。 */
export function compileTikz(source: string, signal?: AbortSignal): Promise<{ svg: string }> {
  signal?.throwIfAborted();
  if (!source.trim()) return Promise.reject(new Error("TikZ 源码不能为空"));
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.setAttribute("aria-hidden", "true");
    let observer: MutationObserver | undefined;
    let settled = false;
    const finish = (error?: unknown, svg?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      observer?.disconnect();
      frame.remove();
      if (error) reject(error);
      else if (svg === undefined) reject(new Error("TikZ 未返回 SVG"));
      else resolve({ svg });
    };
    const cancel = () => finish(signal?.reason ?? new DOMException("编译已取消", "AbortError"));
    const timer = setTimeout(() => finish(new Error("TikZ 编译超过 120 秒")), 120_000);
    signal?.addEventListener("abort", cancel, { once: true });
    frame.onload = () => {
      try {
        const doc = frame.contentDocument;
        if (!doc) throw new Error("无法创建 TikZ 编译上下文");
        doc.body.addEventListener("tikzjax-load-finished", () => {
          const svg = doc.body.querySelector("svg");
          if (svg) {
            const style = doc.createElementNS("http://www.w3.org/2000/svg", "style");
            style.textContent = fontCss;
            svg.prepend(style);
            finish(undefined, new XMLSerializer().serializeToString(svg));
          }
        });
        observer = new MutationObserver(() => {
          if (doc.querySelector('img[src*="invalid.site"]'))
            finish(new Error("TikZ 编译失败，请检查语法与宏包"));
        });
        observer.observe(doc.body, { childList: true, subtree: true });
        const sourceScript = doc.createElement("script");
        sourceScript.type = "text/tikz";
        sourceScript.textContent = `\\begin{document}\n${source}\n\\end{document}`;
        doc.body.appendChild(sourceScript);
        const compiler = doc.createElement("script");
        compiler.src = new URL(compilerUrl, window.location.href).href;
        compiler.onerror = () => finish(new Error("TikZ 编译器加载失败"));
        doc.body.appendChild(compiler);
      } catch (error) {
        finish(error);
      }
    };
    frame.srcdoc = "<!doctype html><html><head><meta charset='utf-8'></head><body></body></html>";
    document.body.appendChild(frame);
    if (signal?.aborted) cancel();
  });
}
