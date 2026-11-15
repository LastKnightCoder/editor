import { Editor, Element, Range, Text, Transforms, type Descendant } from "slate";
import { ReactEditor } from "slate-react";
import { captureEditorSubmission, defineExtension, setSlateFragmentData } from "@tau/editor/api";
import { getMarkdown, importFromMarkdown } from "@/utils/markdown";
import type { EditorKit } from "@tau/editor";
import { createMarkdownContentPreparer } from "./prepareMarkdownContent";
import type { MarkdownViewport } from "./markdownViewport";

const tags: Record<string, string> = {
  paragraph: "p",
  blockquote: "blockquote",
  "bulleted-list": "ul",
  "numbered-list": "ol",
  "check-list": "ul",
  "check-list-item": "li",
  "list-item": "li",
  link: "a",
  "table-row": "tr",
  "table-cell": "td",
  table: "table",
};

function safeUrl(value: unknown) {
  if (typeof value !== "string") return null;
  const url = value.trim();
  return /^(?:https?:\/\/|mailto:|tel:|#)/i.test(url) ? url : null;
}

function wrapText(child: globalThis.Node, tag: string) {
  const outer = document.createElement(tag);
  outer.appendChild(child);
  return outer;
}

function renderNode(node: Descendant): globalThis.Node {
  if (Text.isText(node)) {
    let text: globalThis.Node = document.createTextNode(node.text);
    for (const [active, tag] of [
      [node.code, "code"],
      [node.bold, "strong"],
      [node.italic, "em"],
      [node.underline, "u"],
      [node.strikethrough, "del"],
    ] as const) {
      if (active) text = wrapText(text, tag);
    }
    if (node.color || node.highlight) {
      const span = wrapText(text, "span");
      if (node.color) span.style.color = node.color;
      if (node.highlight)
        span.style.backgroundColor = node.highlight === true ? "yellow" : node.highlight;
      text = span;
    }
    return text;
  }
  if (node.type === "code-block" || node.type === "code-step") {
    if (
      node.type === "code-block" &&
      node.children.some(child => Element.isElement(child) && child.type === "code-step")
    ) {
      const steps = document.createDocumentFragment();
      steps.append(...node.children.map(renderNode));
      return steps;
    }
    return wrapText(wrapText(document.createTextNode(node.code ?? ""), "code"), "pre");
  }
  if (node.type === "image" || node.type === "inline-image") {
    const image = document.createElement("img");
    const src = "url" in node && typeof node.url === "string" ? safeUrl(node.url) : null;
    if (src && /^https?:/i.test(src)) image.src = src;
    image.alt = "alt" in node && typeof node.alt === "string" ? node.alt : "图片";
    return image.hasAttribute("src") ? image : document.createTextNode(image.alt);
  }
  const tag =
    node.type === "header"
      ? `h${Math.min(6, Math.max(1, Math.trunc(node.level) || 1))}`
      : Object.hasOwn(tags, node.type)
        ? tags[node.type]
        : undefined;
  if (!tag) {
    const children = document.createDocumentFragment();
    children.append(...node.children.map(renderNode));
    return children;
  }
  const element = document.createElement(tag);
  if (node.type === "link") {
    const href = safeUrl(node.url);
    if (href) element.setAttribute("href", href);
  }
  if (node.type === "table-cell") {
    if (node.rowSpan && node.rowSpan > 1) element.setAttribute("rowspan", String(node.rowSpan));
    if (node.colSpan && node.colSpan > 1) element.setAttribute("colspan", String(node.colSpan));
  }
  const parent =
    node.type === "table" ? element.appendChild(document.createElement("tbody")) : element;
  for (const child of node.children) parent.appendChild(renderNode(child));
  return element;
}

const allowed = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "caption",
  "code",
  "del",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strike",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

function normalizeExternalHtml(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content
    .querySelectorAll("script,style,title,meta,link,iframe,object,embed,svg,template,noscript")
    .forEach(node => node.remove());
  for (const element of template.content.querySelectorAll("*")) {
    if (!(element instanceof HTMLElement) || !allowed.has(element.localName)) {
      element.replaceWith(...element.childNodes);
      continue;
    }
    const { fontWeight, fontStyle, textDecorationLine } = element.style;
    const bold = fontWeight === "bold" || Number(fontWeight) >= 600;
    const italic = fontStyle === "italic" || fontStyle === "oblique";
    for (const attribute of [...element.attributes]) {
      const name = attribute.name;
      if (name === "href" && element.localName === "a" && safeUrl(attribute.value)) continue;
      if (
        name === "src" &&
        element.localName === "img" &&
        /^https?:\/\//i.test(attribute.value.trim())
      )
        continue;
      if (name === "alt" && element.localName === "img") continue;
      if (
        ["colspan", "rowspan"].includes(name) &&
        /^[1-9]\d{0,2}$/.test(attribute.value) &&
        ["th", "td"].includes(element.localName)
      )
        continue;
      element.removeAttribute(name);
    }
    for (const [active, tag] of [
      [bold, "strong"],
      [italic, "em"],
      [textDecorationLine.includes("line-through"), "del"],
    ] as const) {
      if (!active || element.localName === tag || !element.childNodes.length) continue;
      const wrapper = document.createElement(tag);
      wrapper.append(...element.childNodes);
      element.appendChild(wrapper);
    }
  }
  return template.innerHTML;
}

export function createMarkdownClipboard(viewport: MarkdownViewport, kit: EditorKit) {
  const prepare = createMarkdownContentPreparer(kit);
  return defineExtension({
    id: "tau.markdown-file-viewport",
    plugins: [
      editor => {
        const domEditor = editor as ReactEditor;
        const defaultCopy = domEditor.setFragmentData;
        const defaultPaste = domEditor.insertData;
        domEditor.setFragmentData = (data, origin) => {
          const selection = editor.selection;
          if (selection && Range.isExpanded(selection)) {
            const [start, end] = Range.edges(selection);
            if (viewport.hasSpacers(editor, start.path[0], end.path[0])) {
              const fragment = editor.getFragment();
              const html = document.createDocumentFragment();
              for (const node of fragment) html.appendChild(renderNode(node));
              setSlateFragmentData(editor, data, fragment, getMarkdown(fragment), html);
              return;
            }
          }
          defaultCopy(data, origin);
        };
        domEditor.insertData = async data => {
          const html = data.getData("text/html");
          if (
            !html ||
            data.files.length ||
            data.getData("application/x-slate-fragment") ||
            html.includes("data-slate-fragment=")
          ) {
            defaultPaste(data);
            return;
          }
          let selection = editor.selection;
          const nativeSelection = window.getSelection();
          if (nativeSelection?.anchorNode) {
            try {
              selection =
                ReactEditor.toSlateRange(editor, nativeSelection, {
                  exactMatch: false,
                  suppressThrow: true,
                }) ?? selection;
            } catch {
              // 事件触发时 DOM 可能正在提交，保留已登记的 Slate 选区。
            }
          }
          if (!selection) {
            defaultPaste(data);
            return;
          }
          const plain = data.getData("text/plain");
          const target = Editor.rangeRef(editor, selection);
          const submission = captureEditorSubmission(editor);
          try {
            const { createMarkdownContent } =
              await import("@/utils/web-clipper/markdown-converter");
            const markdown = createMarkdownContent(normalizeExternalHtml(html), undefined, {
              keepLeadingHeading: true,
              throwOnError: true,
            });
            const fragment = markdown ? prepare(importFromMarkdown(markdown), editor) : [];
            const at = target.current;
            if (!at || submission.check()) return;
            submission.commit(() => {
              Transforms.select(editor, at);
              if (fragment.length) {
                if (Range.isExpanded(at)) Editor.deleteFragment(editor);
                if (editor.children.length) {
                  if (!editor.selection) Transforms.select(editor, Editor.start(editor, []));
                  editor.insertFragment(fragment);
                } else {
                  Transforms.insertNodes(editor, fragment, { at: [0], select: true });
                }
              } else if (plain) editor.insertText(plain);
            });
          } catch {
            if (plain && target.current && !submission.check()) {
              const at = target.current;
              submission.commit(() => {
                Transforms.select(editor, at);
                editor.insertText(plain);
              });
            }
          } finally {
            target.unref();
            submission.dispose();
          }
        };
        return editor;
      },
    ],
  });
}
