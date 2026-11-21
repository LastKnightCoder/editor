import {
  Editor,
  Element,
  Node,
  Path,
  Range,
  Text,
  Transforms,
  type NodeEntry,
  type RangeRef,
} from "slate";
import { wrapInlineText } from "@tau/editor/api";
import { ReactEditor } from "slate-react";
import type { LinkElement } from "./types";
import { linkDisplayText, normalizeLinkUrl } from "./url";

export const isLinkElement = (node: unknown): node is LinkElement =>
  Element.isElement(node) && node.type === "link";

/** 选区（或指定位置）所在的链接；不在链接内返回 undefined。 */
export const findLinkEntry = (
  editor: Editor,
  at: Range | Path | undefined = editor.selection ?? undefined
): NodeEntry<LinkElement> | undefined => {
  if (!at) return undefined;
  if (Range.isRange(at)) return Editor.above<LinkElement>(editor, { at, match: isLinkElement });
  const [entry] = Editor.nodes<LinkElement>(editor, { at, match: isLinkElement });
  return entry;
};

/** 链接只有一段无格式文本时才允许直接改文字，带格式时改文字会抹掉格式。 */
export const isPlainLink = (element: LinkElement): boolean =>
  element.children.length === 1 &&
  Object.keys(element.children[0]).every(key => key === "type" || key === "text");

/** 光标放到链接之后，继续输入不会落进链接里。 */
export const selectAfterLink = (editor: Editor, path: Path) => {
  const next = Path.next(path);
  const point = Node.has(editor, next) ? Editor.start(editor, next) : Editor.after(editor, path);
  if (point) Transforms.select(editor, point);
};

export const unwrapLink = (editor: Editor) => {
  if (!editor.selection || ReactEditor.isReadOnly(editor)) return;
  Transforms.unwrapNodes(editor, { match: isLinkElement });
};

/** 重设网址时在选区两端截断旧链接，保留选区外的原地址。 */
function unwrapSelectedLinks(editor: Editor, at: Range) {
  const ref = Editor.rangeRef(editor, at, { affinity: "inward" });
  try {
    for (const edge of Range.edges(at).reverse()) {
      Transforms.splitNodes(editor, { at: edge, match: isLinkElement });
    }
    const range = ref.current;
    if (!range) return;
    Transforms.unwrapNodes(editor, {
      at: range,
      match: (node, path) => {
        if (!isLinkElement(node)) return false;
        const overlap = Range.intersection(range, Editor.range(editor, path));
        return !!overlap && Range.isExpanded(overlap);
      },
    });
    if (ref.current) Transforms.select(editor, ref.current);
  } finally {
    ref.unref();
  }
}

/**
 * 把选区包成链接；选区折叠时以去掉协议的地址作为文字插入。
 * 光标落在新链接之后，返回新链接的路径。
 */
export const wrapLink = (editor: Editor, rawUrl: string): Path | null => {
  if (!editor.selection || ReactEditor.isReadOnly(editor)) return null;
  const url = normalizeLinkUrl(rawUrl);
  if (!url) return null;
  Editor.withoutNormalizing(editor, () => {
    const original = editor.selection;
    if (original && !Editor.nodes(editor, { at: original, match: isLinkElement }).next().done) {
      if (Range.isExpanded(original)) unwrapSelectedLinks(editor, original);
      else unwrapLink(editor);
    }
    const { selection } = editor;
    if (!selection) return;
    if (Range.isCollapsed(selection)) {
      const link: LinkElement = {
        type: "link",
        url,
        children: [{ type: "formatted", text: linkDisplayText(url) }],
      };
      Transforms.insertNodes(editor, link);
    } else {
      wrapInlineText(editor, () => ({ type: "link", url, children: [] }));
    }
  });
  const entry = editor.selection && findLinkEntry(editor, Range.end(editor.selection).path);
  if (!entry) return null;
  selectAfterLink(editor, entry[1]);
  return entry[1];
};

/** 修改已有链接的地址和文字，一次撤销即可还原；地址为空等同取消链接。 */
export const updateLink = (
  editor: Editor,
  path: Path,
  next: { url: string; text?: string }
): void => {
  const node = Node.get(editor, path);
  if (!isLinkElement(node)) return;
  const url = normalizeLinkUrl(next.url);
  if (!url) {
    Transforms.unwrapNodes(editor, { at: path });
    return;
  }
  Editor.withoutNormalizing(editor, () => {
    const text = next.text?.trim();
    if (text && isPlainLink(node) && text !== Node.string(node)) {
      Transforms.insertText(editor, text, { at: [...path, 0] });
    }
    if (url !== node.url) Transforms.setNodes(editor, { url }, { at: path });
  });
};

/** 取消链接并保留原文位置，供「撤销」重新包回。 */
export const unlinkAt = (editor: Editor, path: Path): RangeRef => {
  const ref = Editor.rangeRef(editor, Editor.range(editor, path), { affinity: "inward" });
  Transforms.unwrapNodes(editor, { at: path });
  return ref;
};

export const relinkRange = (editor: Editor, range: Range | null, url: string): void => {
  if (!range || Range.isCollapsed(range)) return;
  wrapInlineText(editor, () => ({ type: "link", url, children: [] }), range);
};

const blockPathAt = (editor: Editor, point: Range["anchor"]) =>
  Editor.above(editor, {
    at: point,
    match: node => Element.isElement(node) && Editor.isBlock(editor, node),
  })?.[1];

/** 行内代码标记由 text-formatting 扩展声明，本包只按字段名读取 */
const hasCodeMark = (editor: Editor, range: Range) => {
  if (Range.isCollapsed(range)) {
    return Boolean((Editor.marks(editor) as { code?: boolean } | null)?.code);
  }
  return [...Editor.nodes(editor, { at: range, match: Text.isText })].some(
    ([node]) => (node as { code?: boolean }).code
  );
};

/**
 * 粘贴单个网址：选区上直接成链，光标处插入为链接。
 * 已在链接里、跨块选区或行内代码中按纯文本粘贴。
 */
export const pasteUrl = (editor: Editor, text: string): void => {
  const { selection } = editor;
  const plain = () => editor.insertText(text.trim());
  if (!selection || ReactEditor.isReadOnly(editor)) return;
  const [start, end] = Range.edges(selection);
  const anchorBlock = blockPathAt(editor, start);
  const sameBlock = anchorBlock && Path.equals(anchorBlock, blockPathAt(editor, end) ?? []);
  const insideLink = Range.isCollapsed(selection) && findLinkEntry(editor);
  if (!sameBlock || insideLink || hasCodeMark(editor, selection)) return plain();
  wrapLink(editor, text);
};
