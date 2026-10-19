import { parse, type DefaultTreeAdapterMap } from "parse5";

const escapeAttribute = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** 只替换真实 HTML 属性，脚本、正文与注释中的占位符会明确报错。 */
export function replaceTemplatePaths(
  html: string,
  paths: Record<"MANIFEST" | "BASE", string>
): string {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const edits: { start: number; end: number; text: string }[] = [];
  function visit(node: DefaultTreeAdapterMap["node"]) {
    if ("attrs" in node)
      for (const attr of node.attrs) {
        if (!/__TAU_\w+__/.test(attr.value)) continue;
        const location =
          node.sourceCodeLocation?.attrs?.[attr.prefix ? attr.prefix + ":" + attr.name : attr.name];
        if (!location) throw new Error("无法定位模板启动属性");
        const value = attr.value.replace(/__TAU_(\w+)__/g, (token, key: string) => {
          if (!Object.hasOwn(paths, key)) throw new Error(`未知模板占位符：${token}`);
          return paths[key as keyof typeof paths];
        });
        const original = html.slice(location.startOffset, location.endOffset);
        const name = original.match(/^[^\s=]+/)![0];
        edits.push({
          start: location.startOffset,
          end: location.endOffset,
          text: `${name}="${escapeAttribute(value)}"`,
        });
      }
    if ("childNodes" in node) node.childNodes.forEach(visit);
    if ("content" in node) visit(node.content);
  }
  visit(document);
  for (const edit of edits.sort((a, b) => b.start - a.start))
    html = html.slice(0, edit.start) + edit.text + html.slice(edit.end);
  if (/__TAU_\w+__/.test(html)) throw new Error("模板启动占位符必须放在 HTML 属性中");
  return html;
}
