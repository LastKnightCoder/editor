import type { ReactElement, ReactNode } from "react";
import type { RenderElementProps } from "slate-react";
import type { Editor } from "slate";
import type { Plugin } from "../utils";
import type { IBlockPanelListItem, IHotKeyConfig, IConfigItem } from "../types/index";

export * from "../types/index";

export default interface IExtension {
  type: string;
  getPlugins: () => Plugin[];
  render: (props: RenderElementProps) => ReactElement;
  getHotkeyConfigs: () => IHotKeyConfig[];
  /** editor 由 BlockPanel 在装配菜单时传入（可据此动态构建子项） */
  getBlockPanelItems: (editor?: Editor) => IBlockPanelListItem[];
  getHoveringBarElements: () => IConfigItem[];
}

export interface IExtensionBaseProps<T> {
  attributes: RenderElementProps["attributes"];
  element: T;
  children: ReactNode;
}
