import type { ReactElement } from "react";
import type { Editor } from "slate";
import type { RenderElementProps } from "slate-react";

import type IExtension from "../extensions/types";
import type { IBlockPanelListItem, IConfigItem, IHotKeyConfig } from "../types";
import type { Plugin } from "../utils/plugin";
import { EXTENSION_API_VERSION, isEditorExtension, type EditorExtension } from "./extension";
import type { EditorCommand } from "./command";

/** kit 接受的扩展：v2 声明式扩展或旧 `IExtension`（后者自动经 `fromLegacyExtension` 适配） */
export type AnyExtension = EditorExtension | IExtension;

/**
 * 适配后的旧扩展：kind / isVoid 由它自己的插件决定，所以元素只带渲染函数；
 * 快捷键仍是旧的 `IHotKeyConfig`，等命令注册表落地后再迁。
 */
export interface LegacyExtensionAdapter extends EditorExtension {
  readonly legacy: IExtension;
  readonly legacyRender: (props: RenderElementProps) => ReactElement | undefined;
  readonly legacyHotkeys: readonly IHotKeyConfig[];
}

const adapters = new WeakMap<IExtension, LegacyExtensionAdapter>();

/**
 * 把旧扩展包成 v2 形状，旧扩展零改动可运行。
 * 按实例缓存：同一个旧扩展总是得到同一个适配对象，否则 kit 的派生缓存失效、编辑器会被重建。
 * 插件、快捷键、工具条用 getter 延迟读取，让装配处的 try/catch 能兜住旧扩展的收集错误。
 */
export function fromLegacyExtension(legacy: IExtension): LegacyExtensionAdapter {
  const cached = adapters.get(legacy);
  if (cached) return cached;
  const adapter: LegacyExtensionAdapter = {
    id: legacy.type,
    apiVersion: EXTENSION_API_VERSION,
    legacy,
    legacyRender: props => legacy.render(props),
    get plugins(): readonly Plugin[] {
      return legacy.getPlugins();
    },
    get legacyHotkeys(): readonly IHotKeyConfig[] {
      return legacy.getHotkeyConfigs();
    },
    get toolbar(): readonly IConfigItem[] {
      return legacy.getHoveringBarElements();
    },
    get commands(): readonly EditorCommand[] | undefined {
      return legacy.commands;
    },
    blockPanel: (editor: Editor): readonly IBlockPanelListItem[] =>
      legacy.getBlockPanelItems(editor),
  };
  adapters.set(legacy, adapter);
  return adapter;
}

export const isLegacyAdapter = (extension: EditorExtension): extension is LegacyExtensionAdapter =>
  "legacy" in extension;

export const toEditorExtension = (extension: AnyExtension): EditorExtension =>
  isEditorExtension(extension) ? extension : fromLegacyExtension(extension);

/** 扩展贡献的元素类型：旧扩展就是它自己的 type */
export const elementTypesOf = (extension: EditorExtension): string[] =>
  isLegacyAdapter(extension)
    ? [extension.legacy.type]
    : (extension.elements ?? []).map(element => element.type);
