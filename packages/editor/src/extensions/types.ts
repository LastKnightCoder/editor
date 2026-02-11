import type { ReactElement, ReactNode } from "react";
import type { RenderElementProps } from "slate-react";
import type { Plugin } from "../utils";
import type {
  IBlockPanelListItem,
  IHotKeyConfig,
  IConfigItem,
} from "../types/index";

export * from "../types/index";

export default interface IExtension {
  type: string;
  getPlugins: () => Plugin[];
  render: (props: RenderElementProps) => ReactElement;
  getHotkeyConfigs: () => IHotKeyConfig[];
  getBlockPanelItems: () => IBlockPanelListItem[];
  getHoveringBarElements: () => IConfigItem[];
}

export interface IExtensionBaseProps<T> {
  attributes: RenderElementProps["attributes"];
  element: T;
  children: ReactNode;
}
