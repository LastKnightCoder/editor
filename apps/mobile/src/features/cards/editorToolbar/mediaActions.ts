import { captureInsertionSubmission, createParagraph, notifierOf } from "@tau/editor/api";
import { getMediaWidthControl, matchMediaWidthPreset } from "@tau/editor/extensions/media/runtime";
import type { AudioElement, InlineImageElement } from "@tau/editor/extensions/media";
import {
  WebLinkSourceType,
  insertWebview,
  normalizeWebviewUrl,
  type WebviewElement,
} from "@tau/editor/extensions/webview";
import {
  Editor as SlateEditor,
  Element as SlateElement,
  Node as SlateNode,
  Path,
  Transforms,
  type Element as ElementNode,
} from "slate";
import { ReactEditor } from "slate-react";

import type { MediaEditingContext } from "./editingContext";

export type MediaAlign = "left" | "center" | "right";

/** 图片 / 视频宽度三档（占编辑区可用宽度的比例），与桌面端吸附档位一致 */
export const MEDIA_WIDTH_PRESETS: Array<{ ratio: number; label: string }> = [
  { ratio: 0.5, label: "小 · 50%" },
  { ratio: 0.75, label: "中 · 75%" },
  { ratio: 1, label: "满宽" },
];

/** 行内图片三档高度（em），宽度按原图比例 */
export const INLINE_IMAGE_SIZES: Array<{ em: number; label: string }> = [
  { em: 1.25, label: "小" },
  { em: 2, label: "中" },
  { em: 3, label: "大" },
];

/** 网页视图三档高度（px），落在桌面端拖拽范围 200–800 内 */
export const WEBVIEW_HEIGHTS: Array<{ height: number; label: string }> = [
  { height: 240, label: "矮 · 240" },
  { height: 400, label: "中 · 400" },
  { height: 640, label: "高 · 640" },
];

const ALIGN_ORDER: MediaAlign[] = ["left", "center", "right"];

const ALIGN_COMMANDS: Partial<Record<MediaEditingContext["mediaType"], string>> = {
  image: "tau.image.set-align",
  video: "tau.video.set-align",
};

type MediaFields = {
  align?: MediaAlign;
  url?: string;
  alt?: string;
  title?: string;
  width?: number;
  height?: number;
  borderRadius?: string;
  shadow?: string | boolean;
};

const fieldsOf = (element: ElementNode) => element as unknown as MediaFields;

/** 按元素引用重新定位：异步操作期间节点可能已移动或被删除 */
function currentPathOf(editor: SlateEditor, context: MediaEditingContext): Path | null {
  if (
    SlateNode.has(editor, context.path) &&
    SlateNode.get(editor, context.path) === context.element
  ) {
    return context.path;
  }
  try {
    const path = ReactEditor.findPath(editor as ReactEditor, context.element);
    return SlateNode.has(editor, path) ? path : null;
  } catch {
    return null;
  }
}

/** 在媒体元素上执行扩展命令（命令按 element + path 定位，与桌面菜单同一实现） */
export function runMediaCommand(
  editor: SlateEditor,
  context: MediaEditingContext,
  commandId: string,
  payload?: unknown
): void {
  const path = currentPathOf(editor, context);
  if (!path) return;
  void editor.commands?.execute(commandId, payload, context.element, path);
}

export function getMediaAlign(context: MediaEditingContext): MediaAlign {
  return fieldsOf(context.element).align ?? "center";
}

export function setMediaAlign(
  editor: SlateEditor,
  context: MediaEditingContext,
  align: MediaAlign
): void {
  const commandId = ALIGN_COMMANDS[context.mediaType];
  if (commandId) runMediaCommand(editor, context, commandId, { align });
}

/** 左 → 中 → 右循环 */
export function cycleMediaAlign(editor: SlateEditor, context: MediaEditingContext): void {
  const current = ALIGN_ORDER.indexOf(getMediaAlign(context));
  setMediaAlign(editor, context, ALIGN_ORDER[(current + 1) % ALIGN_ORDER.length]);
}

/** 当前宽度命中的档位比例；编辑区未挂载或不在档位上为 null */
export function getMediaWidthPreset(
  context: MediaEditingContext,
  editable: HTMLElement | null | undefined
): number | null {
  return matchMediaWidthPreset(context.element, editable);
}

export function applyMediaWidthPreset(context: MediaEditingContext, ratio: number): void {
  getMediaWidthControl(context.element)?.applyPreset(ratio);
}

/**
 * 把光标放到媒体之后（不聚焦）：块级媒体落到下一个可输入块的开头，
 * 下一块不存在或也是 void 时在其后插入空段落；行内图片落到它后面。
 */
export function placeCaretAfterMedia(editor: SlateEditor, context: MediaEditingContext): void {
  const path = currentPathOf(editor, context);
  if (!path) return;
  if (context.mediaType === "inline-image") {
    const after = SlateEditor.after(editor, path) ?? SlateEditor.end(editor, Path.parent(path));
    Transforms.select(editor, after);
    return;
  }
  const nextPath = Path.next(path);
  const next = SlateNode.has(editor, nextPath) ? SlateNode.get(editor, nextPath) : null;
  if (!next || !SlateElement.isElement(next) || editor.isVoid(next)) {
    Transforms.insertNodes(editor, createParagraph(), { at: nextPath });
  }
  Transforms.select(editor, SlateEditor.start(editor, nextPath));
}

/** 删除媒体：块级走内核删除命令（void 删除后补空段落），行内图片直接移除 */
export function deleteMedia(editor: SlateEditor, context: MediaEditingContext): void {
  const path = currentPathOf(editor, context);
  if (!path) return;
  if (context.mediaType === "inline-image") {
    Transforms.removeNodes(editor, { at: path });
    return;
  }
  runMediaCommand(editor, context, "tau.block.delete");
}

// ---- 图片外观 ----

export type ImageAppearanceState = {
  rounded: boolean;
  shadow: boolean;
  /** 圆角与阴影都未单独设置，跟随全局默认 */
  followsDefault: boolean;
};

export function getImageAppearanceState(
  context: MediaEditingContext,
  defaults: { borderRadius?: string; shadow?: string | boolean } | undefined
): ImageAppearanceState {
  const { borderRadius, shadow } = fieldsOf(context.element);
  const radius = borderRadius ?? defaults?.borderRadius ?? "none";
  const effectiveShadow = shadow ?? defaults?.shadow ?? "none";
  return {
    rounded: radius !== "none",
    shadow: effectiveShadow !== "none" && effectiveShadow !== false,
    followsDefault: borderRadius === undefined && shadow === undefined,
  };
}

export function setImageAppearance(
  editor: SlateEditor,
  context: MediaEditingContext,
  patch: { borderRadius?: string; shadow?: string } | "default"
): void {
  if (patch === "default") {
    const path = currentPathOf(editor, context);
    if (path) Transforms.unsetNodes(editor, ["borderRadius", "shadow"], { at: path });
    return;
  }
  runMediaCommand(editor, context, "tau.image.set-appearance", patch);
}

// ---- 行内图片 ----

/** 当前高度命中的档位（em），不在档位上为 null */
export function getInlineImageSize(context: MediaEditingContext): number | null {
  const { height } = fieldsOf(context.element);
  if (!height) return null;
  return INLINE_IMAGE_SIZES.find(size => Math.abs(size.em * 16 - height) < 1)?.em ?? null;
}

/** 按原比例设置行内图片高度；比例取节点宽高，缺失时读已加载图片的原始尺寸 */
export function setInlineImageSize(
  editor: SlateEditor,
  context: MediaEditingContext,
  em: number
): void {
  const path = currentPathOf(editor, context);
  if (!path) return;
  const { width, height } = fieldsOf(context.element);
  let ratio = width && height ? width / height : 0;
  if (!ratio) {
    try {
      const img = ReactEditor.toDOMNode(editor as ReactEditor, context.element).querySelector(
        "img"
      );
      if (img?.naturalWidth && img.naturalHeight) ratio = img.naturalWidth / img.naturalHeight;
    } catch {
      // 节点未渲染
    }
  }
  const nextHeight = em * 16;
  Transforms.setNodes<InlineImageElement>(
    editor,
    { width: nextHeight * (ratio || 1), height: nextHeight },
    { at: path }
  );
}

/** 行内图片转为图片块：插在所在块之后并选中，原行内节点移除，合并为一个撤销步 */
export function convertInlineImageToBlock(editor: SlateEditor, context: MediaEditingContext): void {
  const path = currentPathOf(editor, context);
  if (!path) return;
  const blockEntry = SlateEditor.above(editor, {
    at: path,
    match: node => SlateElement.isElement(node) && SlateEditor.isBlock(editor, node),
  });
  if (!blockEntry) return;
  const { url, alt } = fieldsOf(context.element);
  const imageNode = {
    type: "image",
    url: url ?? "",
    alt,
    uuid: crypto.randomUUID(),
    children: [{ type: "formatted", text: "" }],
  } as unknown as ElementNode;
  const insertAt = Path.next(blockEntry[1]);
  SlateEditor.withoutNormalizing(editor, () => {
    Transforms.insertNodes(editor, imageNode, { at: insertAt });
    Transforms.removeNodes(editor, { at: path });
  });
  // 行内图片移除不改变其后同级块的路径（它在 blockEntry 内部）
  Transforms.select(editor, SlateEditor.start(editor, insertAt));
}

// ---- 网页视图 ----

export function getWebviewHeight(context: MediaEditingContext): number {
  return fieldsOf(context.element).height ?? 400;
}

export function setWebviewHeight(
  editor: SlateEditor,
  context: MediaEditingContext,
  height: number
): void {
  const path = currentPathOf(editor, context);
  if (path) Transforms.setNodes<WebviewElement>(editor, { height }, { at: path });
}

/** 底部输入框修改网页地址（远程地址；本地 HTML 选择在移动端不可用） */
export async function editWebviewUrl(
  editor: SlateEditor,
  context: MediaEditingContext
): Promise<void> {
  const value = await notifierOf(editor).prompt({
    title: "网页地址",
    placeholder: "https://example.com",
    defaultValue: fieldsOf(context.element).url ?? "",
    confirmText: "保存",
    inputMode: "url",
  });
  const url = value ? normalizeWebviewUrl(value) : "";
  if (!url) return;
  const path = currentPathOf(editor, context);
  if (path) {
    Transforms.setNodes<WebviewElement>(
      editor,
      { url, sourceType: WebLinkSourceType.REMOTE },
      { at: path }
    );
  }
}

/** 插入面板「网页」：底部输入地址，提交时回到打开输入框时的插入位置插入 */
export async function promptInsertWebview(editor: SlateEditor): Promise<void> {
  const anchor = captureInsertionSubmission(editor);
  try {
    if (anchor.check()) return;
    const value = await notifierOf(editor).prompt({
      signal: anchor.signal,
      title: "插入网页",
      placeholder: "https://example.com",
      confirmText: "插入",
      inputMode: "url",
    });
    const url = value ? normalizeWebviewUrl(value) : "";
    if (!url) return;
    anchor.commit(({ range }) => {
      Transforms.select(editor, range);
      insertWebview(editor, { url });
    });
  } finally {
    anchor.dispose();
  }
}

// ---- 音频 ----

export async function renameAudio(
  editor: SlateEditor,
  context: MediaEditingContext
): Promise<void> {
  const value = await notifierOf(editor).prompt({
    title: "重命名音频",
    placeholder: "音频标题",
    defaultValue: fieldsOf(context.element).title ?? "",
    confirmText: "完成",
  });
  if (value == null) return;
  const path = currentPathOf(editor, context);
  if (path) {
    Transforms.setNodes<AudioElement>(editor, { title: value.trim() }, { at: path });
  }
}
