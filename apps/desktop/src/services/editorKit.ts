/**
 * Desktop 的 EditorKit：整个应用共用一份（docs/editor-refactor ER-004）。
 *
 * 模块级单例而不是在 React 里创建：离屏测高、命令式面板等场景在 React 树之外也要用同一套
 * 服务与扩展，靠 Context 传递会各建一份（DOMSizeMeasurer、inline-ai 面板历史上就是如此）。
 *
 * 用函数而不是模块级常量：`@/editor-extensions` 会经扩展组件绕回本模块，
 * 模块初始化期创建 kit 会拿到未初始化的导入（详见 04 踩坑）。首次调用时才创建并缓存。
 */
import {
  createBareEditorKit,
  createEditorKit,
  type EditorKit,
  type IExtension,
} from "@tau/editor/src";
import { createDesktopEditorExtensions } from "@/editor-extensions";
import { desktopEditorServices } from "./editorRegistry";

let cached: EditorKit | null = null;

export function getDesktopKit(): EditorKit {
  if (!cached) {
    cached = createEditorKit({
      extensions: createDesktopEditorExtensions(),
      services: [desktopEditorServices],
      // createImageExtensions 按 type 替换内置 image / image-gallery
      override: true,
    });
  }
  return cached;
}

const bareCache = new Map<readonly IExtension[], EditorKit>();

/**
 * 「裸编辑器」kit：沿用 desktop 的服务，但不装内置与宿主扩展，由调用方列出所需扩展。
 * 用于发布预览（要与 blog 输出一致，不能带宿主块）与白板箭头描述（只要极少数行内能力）。
 */
export function getDesktopBareKit(extensions: readonly IExtension[] = EMPTY): EditorKit {
  let kit = bareCache.get(extensions);
  if (!kit) {
    kit = createBareEditorKit({ extensions: [...extensions], services: [desktopEditorServices] });
    bareCache.set(extensions, kit);
  }
  return kit;
}

const EMPTY: readonly IExtension[] = [];
