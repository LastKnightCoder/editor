import { parse, type DefaultTreeAdapterTypes as HTML } from "parse5";
import rough from "roughjs/bundled/rough.js?raw";
import roughLicense from "roughjs/LICENSE?raw";
import { getTemplateById, type PPTTemplate } from "@/constants/ppt-templates";
import { cinematicFiles } from "./cinematic";

export function elements(root: HTML.ParentNode): HTML.Element[] {
  return root.childNodes.flatMap(node => ("tagName" in node ? [node, ...elements(node)] : []));
}

export function hasSlideClass(node: HTML.Element) {
  return node.attrs.some(
    attr => attr.name === "class" && attr.value.split(/\s+/).includes("slide")
  );
}

// 按 HTML 解析器的源码位置切片，嵌套 div、注释和页容器的结束标签都能原样保留。
export function splitSlides(source: string) {
  const dom = parse(source, {
    sourceCodeLocationInfo: true,
    onParseError: error => {
      throw new Error(`第 ${error.startLine} 行 HTML 不完整（${error.code}）`);
    },
  });
  const nodes = elements(dom);
  const slides = nodes.filter(hasSlideClass);
  if (!slides.length) throw new Error("找不到独立的 .slide 页面");
  const parent = slides[0].parentNode;
  let end = 0;
  const pages = slides.map(node => {
    const loc = node.sourceCodeLocation;
    if (!loc?.endTag || node.parentNode !== parent || !["section", "div"].includes(node.tagName))
      throw new Error("页面边界不完整或页面不在同一容器");
    const gap = source.slice(end, loc.startOffset);
    if (end && gap.replace(/<!--[\s\S]*?-->/g, "").trim()) throw new Error("页面之间含独立内容");
    end = loc.endOffset;
    return { node, before: gap, html: source.slice(loc.startOffset, end) };
  });
  return { nodes, pages, tail: source.slice(end) };
}

type TemplateFiles = Record<string, string>;
export const ORIGINAL_TEMPLATE = "original-v1";
const cache = new Map<string, TemplateFiles>([["cinematic-v1", cinematicFiles]]);
export function isPPTTemplate(version: unknown): version is string {
  return (
    typeof version === "string" &&
    (version === ORIGINAL_TEMPLATE ||
      (version.endsWith("-v1") && !!getTemplateById(version.slice(0, -3))))
  );
}

function prepareTemplate(template: PPTTemplate): TemplateFiles {
  const source = template.fullTemplate;
  const { nodes, pages, tail } = splitSlides(source);
  const files: TemplateFiles = {};
  let shell = pages[0].before + "{{slides}}" + tail;
  const style = nodes.find(node => node.tagName === "style")?.sourceCodeLocation;
  if (!style?.startTag || !style.endTag) throw new Error(`${template.name}缺少模板样式`);
  files["template/theme.css"] = source.slice(style.startTag.endOffset, style.endTag.startOffset);
  shell = shell
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/i, "<style>{{theme}}</style>")
    .replace(/<link\b[^>]*>/gi, "")
    .replace(/<title>[^<]*<\/title>/i, "<title>{{title}}</title>");
  if (template.id === "handwritten") {
    const script = nodes.find(node => node.tagName === "script")?.sourceCodeLocation;
    if (!script?.startTag || !script.endTag) throw new Error("手绘模板缺少装饰脚本");
    const code = source.slice(script.startTag.endOffset, script.endTag.startOffset);
    const dependency = "import rough from 'https://esm.sh/roughjs@4.6.6?bundle-deps';";
    if (!code.includes(dependency)) throw new Error("手绘装饰库版本与模板不符");
    files["template/decoration.js"] = code.replace(
      dependency,
      () => `/* ${roughLicense} */\n${rough}`
    );
    shell = shell.replace(
      source.slice(script.startOffset, script.endOffset),
      '<script nonce="tauDeck" data-ppt-decoration>{{decoration}}</script>'
    );
  }
  files["template/shell.html"] = shell;
  const layouts = pages.map(({ html, node, before }, i) => {
    const path = `template/examples/page-${String(i + 1).padStart(2, "0")}.html`;
    files[path] = html;
    const label =
      node.attrs.find(a => a.name === "aria-label" || a.name === "data-kicker")?.value ??
      before
        .match(/<!--((?:(?!-->)[\s\S])*)-->\s*$/)?.[1]
        ?.replace(/[═=]+/g, "")
        .trim() ??
      html.match(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i)?.[1]?.replace(/<[^>]+>/g, "") ??
      "";
    return `${path} ${label}`;
  });
  files["template/layouts.md"] = [template.name, template.description, ...layouts].join("\n");
  files["template/style.md"] = template.styleGuide;
  return files;
}

export function templateFiles(version: string): TemplateFiles {
  const found = cache.get(version);
  if (found) return found;
  const template = getTemplateById(version.slice(0, -3));
  if (!template || !isPPTTemplate(version)) throw new Error("无法读取指定模板版本");
  const files = prepareTemplate(template);
  cache.set(version, files);
  return files;
}
