/**
 * Desktop 的 EditorKit：**按场景**一个，不是一个应用一份（docs/editor-refactor ER-016）。
 * 每个 kit 只注册该场景的内容实际会包含的扩展，不要求全量覆盖（ER-017）。
 *
 * 所有 kit 都建在同一个底座上：内置扩展 + desktop 静态扩展（markdown 粘贴导入、webview、
 * 图片覆盖）+ desktop 服务注册项；场景差异只在额外扩展。
 *
 * 模块级单例而不是在 React 里创建：离屏测高、命令式面板等场景在 React 树之外也要用同一套
 * 服务与扩展，靠 Context 传递会各建一份（DOMSizeMeasurer 历史上就是如此）。
 *
 * 用函数而不是模块级常量：`@/editor-extensions` 会经扩展组件绕回本模块，
 * 模块初始化期创建 kit 会拿到未初始化的导入（详见 04 踩坑）。首次调用时才创建并缓存。
 */
import {
  createBareEditorKit,
  createEditorKit,
  type AnyExtension,
  type EditorKit,
} from "@tau/editor/src";
import { inlineMath, link, paragraph } from "@tau/editor/src/extensions";
import { createDesktopEditorExtensions, fileAttachmentExtension } from "@/editor-extensions";
import flashcardBlankExtension from "@/editor-extensions/flashcard-blank";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import { desktopEditorServices } from "./editorRegistry";

/** 异步装载的宿主扩展必须先就位：kit 只建一次，少拿了就整个应用少几种块，且不会报错 */
function requireHostExtensions(): AnyExtension[] {
  const state = useDynamicExtensionsStore.getState();
  if (!state.initialized) {
    throw new Error(
      "[desktop] 宿主扩展尚未装载：请在渲染前 await useDynamicExtensionsStore.getState().initExtensions()"
    );
  }
  return state.extensions;
}

const byExtras = new Map<string, EditorKit>();

/**
 * 建一个场景 kit：底座（内置 + desktop 静态 + desktop 服务）加上该场景的额外扩展。
 * 按额外扩展的标识（旧扩展 type、v2 扩展 id）缓存，同一场景反复调用拿到同一个实例（否则编辑器会被重建）。
 */
export function createDesktopKit(extras: readonly AnyExtension[] = []): EditorKit {
  const key = extras
    .map(extension => ("type" in extension ? extension.type : extension.id))
    .join(",");
  let kit = byExtras.get(key);
  if (!kit) {
    kit = createEditorKit({
      extensions: [...createDesktopEditorExtensions(), ...extras],
      services: [desktopEditorServices],
      // createImageExtensions 按 type 替换内置 image / image-gallery
      override: true,
    });
    byExtras.set(key, kit);
  }
  return kit;
}

/**
 * `contents` 表里的内容（卡片、文章、日记、项目文档、待办描述、数据库行详情…），
 * 也就是 `ContentEditor` 承载的那类；含它们的只读预览、新建草稿、白板富文本与其离屏测高。
 *
 * 预览和测高必须与可编辑处用同一个 kit：预览要能渲染正文里真实存在的块，
 * 测高要和真实渲染的块集一致，否则量出来的高度不对（见 04 P6.5 与 P6.6）。
 */
export function getContentKit(): EditorKit {
  return createDesktopKit(requireHostExtensions());
}

/**
 * 简短描述输入：时间记录、日程备注、项目描述、问题背景、PDF 批注、白板图形文字。
 * 内容内联在业务记录的 JSON 列里，没有任何完整编辑器会去渲染它，所以不装content 专属块。
 * 成对的只读预览点必须也用这个 kit，否则同一段内容在预览里只剩通用占位。
 */
export function getDescriptionKit(): EditorKit {
  return createDesktopKit();
}

/**
 * Markdown 窗口的文件编辑。
 * 不装白板与数据库块：它们在 Markdown 里没有语法（数据库无 codec、白板只有 void 占位），
 * 插进去保存回 `.md` 会丢内容（ER-015 推翻后保留的事实）。
 */
export function getMarkdownFileKit(): EditorKit {
  return createDesktopKit([fileAttachmentExtension]);
}

/**
 * skill 的 `SKILL.md` 编辑与预览：只有底座，与 P6.5 之前一致。
 * 与 Markdown 窗口不同，这里不装附件；要加先确认附件在 skill 文件里的序列化与使用方式。
 */
export function getSkillFileKit(): EditorKit {
  return createDesktopKit();
}

let flashcardBlank: AnyExtension | null = null;

/**
 * 闪卡正文与背面：只多一个填空元素。
 * `blanks: false` 给不允许挖空的字段（原先靠传空扩展数组表达）。
 */
export function getFlashcardKit({ blanks = true }: { blanks?: boolean } = {}): EditorKit {
  if (!blanks) return createDesktopKit();
  flashcardBlank ??= flashcardBlankExtension;
  return createDesktopKit([flashcardBlank]);
}

let arrowLabelKit: EditorKit | null = null;

/**
 * 白板箭头描述：SVG `foreignObject` 里的迷你单行编辑器，只要段落、行内公式、链接。
 * 这是唯一需要**比内置更少**的场景，所以不走 `createDesktopKit`（它总带全部内置扩展）。
 */
export function getArrowLabelKit(): EditorKit {
  return (arrowLabelKit ??= createBareEditorKit({
    extensions: [paragraph, inlineMath, link],
    services: [desktopEditorServices],
  }));
}
