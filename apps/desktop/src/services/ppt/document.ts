import { parseFragment, serializeOuter, type DefaultTreeAdapterTypes as HTML } from "parse5";
import type { Descendant } from "slate";
import { withPPTRuntime } from "@/utils/ppt-runtime";
import { isPPTTemplate, ORIGINAL_TEMPLATE, templateFiles } from "./template";
import { originalShellPath, renderOriginalShell } from "./original-shell";

export type PPTFiles = Record<string, string>;
export interface PPTManifest {
  format: "tau-ppt";
  version: 1;
  template: string;
  title: string;
  slides: { id: string; intent: string }[];
}

export const slidePath = /^slides\/([a-z][a-z0-9_-]{0,63})\.html$/;
export function readManifest(source: string): PPTManifest {
  let m;
  try {
    m = JSON.parse(source);
  } catch {
    throw new Error("deck.json 缺失或 JSON 不完整");
  }
  if (m?.format !== "tau-ppt" || m.version !== 1 || !isPPTTemplate(m.template))
    throw new Error("此版本不支持该演示文稿格式或模板");
  if (
    typeof m.title !== "string" ||
    !m.title.trim() ||
    !Array.isArray(m.slides) ||
    !m.slides.length
  )
    throw new Error("deck.json 需要标题与非空 slides 清单");
  const ids = new Set<string>();
  for (const slide of m.slides) {
    if (
      typeof slide?.id !== "string" ||
      !/^[a-z][a-z0-9_-]{0,63}$/.test(slide.id) ||
      typeof slide.intent !== "string" ||
      !slide.intent.trim() ||
      ids.has(slide.id)
    )
      throw new Error("deck.json 每页需要唯一的英文短 ID 与非空 intent");
    ids.add(slide.id);
  }
  return m;
}

const pageTags = new Set(
  "section div span canvas a caption h1 h2 h3 h4 h5 h6 p ol ul li dl dt dd strong em b i u s small sub sup mark code pre blockquote cite figure figcaption header footer main article aside br hr img table thead tbody tfoot tr th td svg g defs path rect circle ellipse line polyline polygon text tspan title desc linearGradient radialGradient stop clipPath marker use".split(
    " "
  )
);
const voidTags = new Set(["br", "hr", "img"]);
const raster = /^data:image\/(?:png|jpeg|webp|gif|avif);base64,[a-zA-Z0-9+/=]+$/;
export const assetPath = /^assets\/[a-z][a-z0-9_-]*\.image$/;
function checkCss(css: string) {
  if (/[<\\]|@import\b|image-set\s*\(|url\s*\(\s*["']?(?![#"'\s])/i.test(css))
    throw new Error("样式只支持文稿内的资源引用");
}

function parseSlide(id: string, source: string, ids: Set<string>, files?: PPTFiles) {
  const fail = (reason: string): never => {
    throw new Error(`slides/${id}.html：${reason}`);
  };
  if (!source?.trim()) return fail("文件缺失或为空");
  if (/<(?:!doctype|html|head|body)\b/i.test(source)) fail("单页文件不能包含整稿外壳");
  const tree = parseFragment(source, {
    sourceCodeLocationInfo: true,
    onParseError: e => fail(`第 ${e.startLine} 行 ${e.code}`),
  });
  const nodes = tree.childNodes.filter(
    node =>
      node.nodeName !== "#comment" &&
      !(node.nodeName === "#text" && "value" in node && !node.value.trim())
  );
  const root = nodes[0];
  if (nodes.length !== 1 || !("tagName" in root) || !["div", "section"].includes(root.tagName))
    return fail("需要一个带 slide 类的 section 或 div 根元素");
  const classes = root.attrs.find(a => a.name === "class");
  if (!classes || !classes.value.split(/\s+/).includes("slide")) return fail("根元素缺少 slide 类");
  let hasContent = false;
  function visit(el: HTML.Element) {
    const loc = el.sourceCodeLocation;
    if (!pageTags.has(el.tagName)) fail(`不支持 <${el.tagName}>`);
    if (
      !loc?.startTag ||
      (!voidTags.has(el.tagName) &&
        !loc.endTag &&
        !(
          el.namespaceURI.endsWith("/svg") &&
          source.slice(loc.startOffset, loc.endOffset).endsWith("/>")
        ))
    )
      fail(`请显式写出 <${el.tagName}> 的开始和结束标签`);
    for (const attr of el.attrs) {
      const { name, value } = attr;
      if (
        /^on|^data-deck-|^(?:srcset|srcdoc|nonce|is|background|ping|autofocus|formaction)$/i.test(
          name
        )
      )
        fail(`不支持属性 ${name}`);
      if (name === "class" && el !== root && value.split(/\s+/).includes("slide"))
        fail("页面不能嵌套");
      if (name === "style") {
        try {
          checkCss(value);
        } catch {
          fail("页面样式引用了外部资源");
        }
      }
      if (name === "id") {
        if (ids.has(value)) fail(`重复的 DOM ID ${value}`);
        ids.add(value);
      }
      if (name === "href" && !value.startsWith("#")) fail("仅支持文稿内引用");
      if (name === "src") {
        if (el.tagName !== "img") fail("仅图片可带 src");
        if (assetPath.test(value)) {
          if (files && !raster.test(files[value] ?? "")) fail(`缺少图片 ${value}`);
          if (files) attr.value = files[value];
        } else if (!raster.test(value)) fail("图片必须使用已随稿保存的资源");
      }
    }
    if (el.tagName === "img" && !el.attrs.some(attr => attr.name === "src")) fail("图片缺少 src");
    if (el.tagName === "svg" || el.tagName === "img") hasContent = true;
    for (const child of el.childNodes) {
      if ("tagName" in child) visit(child);
      else if ("value" in child && child.value.trim()) hasContent = true;
    }
  }
  visit(root);
  if (!hasContent) fail("页面缺少内容");
  const location = root.sourceCodeLocation;
  if (!location) return fail("无法定位页根");
  const prefix = source.slice(0, location.startOffset);
  const suffix = source.slice(location.endOffset);
  if ([prefix, suffix].some(gap => gap.replace(/<!--[\s\S]*?-->/g, "").trim()))
    return fail("页根之外有额外标记");
  return { root, classes, prefix, suffix };
}

export function validatePPTSlide(id: string, source: string) {
  parseSlide(id, source, new Set());
}

export function compilePPT(files: PPTFiles) {
  const manifest = readManifest(files["deck.json"]);
  const ids = new Set<string>();
  const paths = new Set(manifest.slides.map(({ id }) => `slides/${id}.html`));
  for (const path of Object.keys(files)) {
    if (
      !(path === originalShellPath && manifest.template === ORIGINAL_TEMPLATE) &&
      path !== "deck.json" &&
      path !== "overrides.css" &&
      !assetPath.test(path) &&
      !paths.has(path)
    )
      throw new Error(`${path} 未列入文稿清单`);
  }
  const slides = manifest.slides
    .map(({ id }, index) => {
      const source = files[`slides/${id}.html`];
      const { root, classes, prefix, suffix } = parseSlide(id, source, ids, files);
      classes.value = classes.value
        .split(/\s+/)
        .filter(c => c !== "active")
        .concat(index === 0 ? ["active"] : [])
        .join(" ");
      root.attrs = root.attrs.filter(a => a.name !== "data-slide-id");
      root.attrs.push({ name: "data-slide-id", value: id });
      return prefix + serializeOuter(root) + suffix;
    })
    .join("\n");
  const overrides = files["overrides.css"] ?? "";
  checkCss(overrides);
  let shell: string;
  if (manifest.template === ORIGINAL_TEMPLATE) {
    shell = renderOriginalShell(files[originalShellPath], slides, manifest.title, overrides);
  } else {
    const pack = templateFiles(manifest.template);
    const slots: Record<string, string> = {
      theme: pack["template/theme.css"] + "\n" + overrides,
      title: manifest.title
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;"),
      decoration: pack["template/decoration.js"] ?? "",
      slides,
    };
    shell = pack["template/shell.html"].replace(
      /\{\{(theme|title|decoration|slides)\}\}/g,
      (_, key: string) => slots[key]
    );
  }
  const policy =
    "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-tauDeck'; base-uri 'none'; form-action 'none'";
  const html = withPPTRuntime(shell)
    .replace(
      /<head\b[^>]*>/i,
      tag => `${tag}<meta http-equiv="Content-Security-Policy" content="${policy}">`
    )
    .replace("<script data-deck-runtime>", '<script nonce="tauDeck" data-deck-runtime>');
  return { manifest, html };
}

type FileBlock = {
  type: string;
  uuid?: string;
  filename?: string;
  code?: string;
  children: { type?: string; code?: string }[];
};
export function decodePPTFiles(nodes: Descendant[]): PPTFiles | null {
  const blocks = nodes as unknown as FileBlock[];
  if (blocks[0]?.type !== "code-block" || blocks[0].filename !== "deck.json") return null;
  const files: PPTFiles = Object.create(null);
  for (const block of blocks) {
    const path = block.filename;
    const code = block.children?.[0]?.code ?? block.code;
    if (
      block.type !== "code-block" ||
      !path ||
      Object.hasOwn(files, path) ||
      typeof code !== "string"
    )
      throw new Error("演示文稿包含损坏或重复的文件块");
    files[path] = code;
  }
  readManifest(files["deck.json"]);
  return files;
}

export function encodePPTFiles(files: PPTFiles, original: Descendant[] = []): Descendant[] {
  const blocks = new Map((original as unknown as FileBlock[]).map(node => [node.filename, node]));
  return ["deck.json", ...Object.keys(files).filter(path => path !== "deck.json")].map(filename => {
    const old = blocks.get(filename);
    const code = files[filename];
    const step = old?.children?.[0];
    if (old && step?.code === code) return old as Descendant;
    return {
      ...old,
      type: "code-block",
      uuid: old?.uuid ?? crypto.randomUUID(),
      filename,
      language: filename.endsWith(".html")
        ? "html"
        : filename.endsWith(".css")
          ? "css"
          : filename.endsWith(".json")
            ? "json"
            : "text",
      children: [
        {
          ...(step?.type === "code-step" ? step : {}),
          type: "code-step",
          code,
          children: [{ type: "formatted", text: "" }],
        },
      ],
    } as Descendant;
  });
}
