import type { ReactElement, ReactNode } from "react";
import type { RenderElementProps } from "slate-react";
import type { Editor } from "slate";
import type { Plugin } from "../utils";
import type { IBlockPanelListItem, IHotKeyConfig, IConfigItem } from "../types/index";
import type { EditorCommand } from "../api/command";
import type { EditorMenuContribution } from "../api/menu";
import type { ElementDrag } from "../api/drag";
import type { ElementIngestSpec } from "../api/ingest";

export * from "../types/index";

export default interface IExtension {
  type: string;
  getPlugins: () => Plugin[];
  render: (props: RenderElementProps) => ReactElement;
  getHotkeyConfigs: () => IHotKeyConfig[];
  /** editor 由 BlockPanel 在装配菜单时传入（可据此动态构建子项） */
  getBlockPanelItems: (editor?: Editor) => IBlockPanelListItem[];
  getHoveringBarElements: () => IConfigItem[];
  /** 菜单等入口引用的命令（过渡：等扩展迁 v2 时搬进 `defineExtension` 的 `commands`） */
  commands?: EditorCommand[];
  /**
   * 手柄/右键菜单的特有条目（过渡：等扩展迁 v2 时搬进 `defineExtension` 的 `menu`）。
   * 公共条目（删除/复制/转换等）由内核默认菜单扩展贡献，不在这里写。
   */
  menuItems?: EditorMenuContribution;
  /** 拖拽声明（过渡：等扩展迁 v2 时搬进 `defineElement` 的 `drag`）；未声明则没有拖拽 chrome */
  dragSpec?: ElementDrag;
  /** 内容注入声明（过渡：等扩展迁 v2 时搬进 `defineElement` 的 `ingest`） */
  ingestSpec?: ElementIngestSpec;
}

export interface IExtensionBaseProps<T> {
  attributes: RenderElementProps["attributes"];
  element: T;
  children: ReactNode;
}
