import { useRef, useSyncExternalStore } from "react";
import {
  isMobilePluginSettled,
  mobileContentPlugins,
  mobilePluginElementSupport,
  mobilePluginState,
} from "../app/plugins/content";
import { IElementEditingPolicy, IUnknownElementNotice } from "@tau/editor/api";
/**
 * Mobile 的 EditorKit：**按场景**一个（docs/editor-refactor ER-016），
 * 每个只注册该场景需要的扩展（ER-017）。命名与 desktop 对齐，实现可以是 mobile 自己的。
 *
 * 用函数延迟创建，避免与扩展模块的初始化顺序耦合（同 desktop，见 04 踩坑）。
 */
import { createEditorKit, type EditorKit } from "@tau/editor";
import { createImageExtensions } from "@tau/editor/extensions/media";
import { standardExtensions } from "@tau/editor/presets/standard";
import { createMarkdownPasteImportExtension, type EditorExtension } from "@tau/editor";
import webviewExtension from "@tau/editor/extensions/webview";
import { diagramExtensions } from "@tau/editor/extensions/diagram";
import { previewMenuExtension } from "@tau/editor-source-view/menu";
import codeBlockExtension from "@tau/editor/extensions/code-block";
import { mathExtensions } from "@tau/editor/extensions/math";
import emojiExtension from "@tau/editor/extensions/emoji";
import { flashcardBlankExtension } from "../features/flashcard/blank/FlashcardBlankExtension";
import { mobileCardPreviewExtensions } from "../features/cards/editorExtensions";
import {
  mobileEditorServices,
  mobileImageAppearance,
  mobileImportFromMarkdown,
} from "./editorRegistry";

const byExtras = new Map<string, EditorKit>();

/** 底座：内置扩展 + mobile 静态扩展（markdown 粘贴导入、webview、图片覆盖）+ mobile 服务 */
function createMobileKit(extras: readonly EditorExtension[] = []): EditorKit {
  const key = extras.map(extension => extension.id).join(",");
  let kit = byExtras.get(key);
  if (!kit) {
    kit = createEditorKit({
      extensions: [
        ...standardExtensions,
        ...diagramExtensions,
        previewMenuExtension,
        codeBlockExtension,
        ...mathExtensions,
        emojiExtension,
        createMarkdownPasteImportExtension(mobileImportFromMarkdown),
        webviewExtension,
        ...createImageExtensions({ appearance: mobileImageAppearance }),
        ...extras,
      ],
      services: [mobileEditorServices],
      // createImageExtensions 按 type 替换内置 image
      override: true,
    });
    byExtras.set(key, kit);
  }
  return kit;
}

/**
 * `contents` 表里的内容：卡片、文章、日记、项目文档，以及日程备注（`detailContentId`）
 * 与待办描述（`descriptionContentId`）——后两者虽然像「描述」，但存的是 content 且 desktop
 * 也读写同一条，所以必须覆盖跨端清单（`CONTENT_ELEMENT_TYPES`，见 P10）。
 */
let contentSnapshot: readonly EditorExtension[] | undefined;
let contentKit: EditorKit | undefined;
let compactSnapshot: readonly EditorExtension[] | undefined;
let compactKit: EditorKit | undefined;
/** 简短内容保留底座与插件扩展，不装内容链接、附件、白板及数据库业务扩展。 */
export function getMobileCompactKit(): EditorKit {
  if (compactSnapshot !== mobileContentPlugins.extensions || !compactKit) {
    compactSnapshot = mobileContentPlugins.extensions;
    const support = new Map(mobilePluginElementSupport);
    compactKit = createMobileKit().extend({
      extensions: compactSnapshot,
      services: [
        register =>
          register(IElementEditingPolicy, {
            canEdit: type => !support.has(type) || support.get(type) === "edit",
          }),
        register => register(IUnknownElementNotice, { describe: describeUnknownElement }),
      ],
    });
  }
  return compactKit;
}
export function getMobileContentKit(): EditorKit {
  if (contentSnapshot !== mobileContentPlugins.extensions || !contentKit) {
    contentSnapshot = mobileContentPlugins.extensions;
    const support = new Map(mobilePluginElementSupport);
    contentKit = createMobileKit(mobileCardPreviewExtensions).extend({
      extensions: contentSnapshot,
      services: [
        register =>
          register(IElementEditingPolicy, {
            canEdit: type => !support.has(type) || support.get(type) === "edit",
          }),
        register => register(IUnknownElementNotice, { describe: describeUnknownElement }),
      ],
    });
  }
  return contentKit;
}

/** 未注册节点多半来自插件：按会话阶段说明原因，内容始终原样保留 */
function describeUnknownElement() {
  const { phase } = mobilePluginState.get();
  if (phase === "starting") return { message: "插件内容加载中…", title: "插件就绪后自动显示" };
  if (phase === "safe" || phase === "failed")
    return { message: "插件未运行，内容已原样保留", title: "可在插件中心查看插件状态" };
  return undefined;
}

const subscribePluginPhase = mobilePluginState.subscribe;
const readPluginSettled = isMobilePluginSettled;

/**
 * 组件内取内容 kit：read 随插件会话变化取最新 kit（只读编辑器重建无副作用）；
 * edit 在插件落定前返回 null（调用方显示占位），落定后锁定首个 kit，编辑中途不因会话重载而重建编辑器。
 */
export function useMobileContentKit(mode: "read", kind?: "full" | "compact"): EditorKit;
export function useMobileContentKit(mode: "edit", kind?: "full" | "compact"): EditorKit | null;
export function useMobileContentKit(
  mode: "read" | "edit",
  kind: "full" | "compact" = "full"
): EditorKit | null {
  const settled = useSyncExternalStore(subscribePluginPhase, readPluginSettled, readPluginSettled);
  const locked = useRef<EditorKit | null>(null);
  const getKit = kind === "compact" ? getMobileCompactKit : getMobileContentKit;
  if (mode === "read") return getKit();
  if (!locked.current && settled) locked.current = getKit();
  return locked.current;
}

/** 插件随包资料的只读展示：不含插件扩展，文档已按白名单清洗 */
export function getMobilePluginDocumentKit(): EditorKit {
  return createMobileKit();
}

let flashcardBlank: EditorExtension | null = null;

/** 闪卡题干与背面补充：只多一个填空元素；背面与非挖空题不需要 */
export function getMobileFlashcardKit({ blanks = true }: { blanks?: boolean } = {}): EditorKit {
  if (!blanks) return createMobileKit();
  flashcardBlank ??= flashcardBlankExtension;
  return createMobileKit([flashcardBlank!]);
}
