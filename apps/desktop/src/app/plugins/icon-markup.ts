import { createElement } from "react";
import type { PluginIcon } from "@tau/plugins";

/** 与主进程 plugin_entity_kinds.icon 的上限一致 */
const MAX_ICON_MARKUP = 16 * 1024;
const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * 把插件图标组件渲染成 SVG 文本，随库保存后在插件不运行时显示。结果只作 CSS 遮罩使用
 * （图像上下文不执行脚本、不加载外部资源），因此不做 HTML 净化。
 */
export async function renderPluginIconMarkup(Icon: PluginIcon): Promise<string> {
  // 静态渲染与调用时机无关（不受 React 正在渲染的限制），按需加载不进启动路径
  const { renderToStaticMarkup } = await import("react-dom/server");
  const template = document.createElement("template");
  template.innerHTML = renderToStaticMarkup(createElement(Icon, { size: 24, strokeWidth: 2 }));
  const svg = template.content.firstElementChild;
  if (template.content.childNodes.length !== 1 || svg?.namespaceURI !== SVG_NS)
    throw new Error("类型图标必须渲染为单个 <svg>");
  // 作为独立 SVG 图像时必须带命名空间；缺尺寸时按 24 × 24
  if (!svg.getAttribute("xmlns")) svg.setAttribute("xmlns", SVG_NS);
  if (!svg.getAttribute("width")) svg.setAttribute("width", "24");
  if (!svg.getAttribute("height")) svg.setAttribute("height", "24");
  const markup = svg.outerHTML;
  if (markup.length > MAX_ICON_MARKUP) throw new Error("类型图标超过 16 KB");
  return markup;
}
