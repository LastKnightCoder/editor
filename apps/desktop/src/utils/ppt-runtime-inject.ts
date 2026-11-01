// 纯字符串处理，不依赖 Vite：应用内预览与 scripts/preview-ppt-templates.mjs 共用
const RUNTIME_ATTR = "data-deck-runtime";
// 运行时以前内联进来的块，或模型误写的外链引用
const STALE_RUNTIME =
  /\n?<(style|script)\b[^>]*\bdata-deck-runtime\b[^>]*>[\s\S]*?<\/\1>\n?|<link\b[^>]*\bdeck\.css\b[^>]*>\s*|<script\b[^>]*\bsrc="[^"]*\bdeck\.js"[^>]*>\s*<\/script>\s*/gi;
// 早期生成的 PPT 自带导航类，再注入会重复绑定键盘与滚轮
const LEGACY_NAVIGATION = /class\s+SlidePresentation\b/;

/** 把 deck.css / deck.js 内联进 PPT HTML；重复调用结果不变 */
export function injectPPTRuntime(html: string, runtime: { css: string; js: string }): string {
  if (!html.trim() || LEGACY_NAVIGATION.test(html)) return html;
  const cleaned = html.replace(STALE_RUNTIME, "");
  const style = `<style ${RUNTIME_ATTR}>\n${runtime.css}</style>\n`;
  const script = `<script ${RUNTIME_ATTR}>\n${runtime.js}</script>\n`;
  // deck.css 放在 <head> 最前，模板自己的 <style> 在后才能覆盖全览配色
  const withStyle = /<head\b[^>]*>/i.test(cleaned)
    ? cleaned.replace(/<head\b[^>]*>/i, tag => `${tag}\n${style}`)
    : style + cleaned;
  const bodyEnd = withStyle.toLowerCase().lastIndexOf("</body>");
  return bodyEnd === -1
    ? withStyle + script
    : withStyle.slice(0, bodyEnd) + script + withStyle.slice(bodyEnd);
}
