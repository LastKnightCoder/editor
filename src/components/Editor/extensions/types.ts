import { RenderElementProps } from "slate-react";
import { Plugin } from "../utils/plugin.ts";
import { IBlockPanelListItem, IHotKeyConfig, IConfigItem } from "@/components/Editor/types";

export default interface IExtension {
  type: string;
  getPlugins: () => Plugin[];
  render: (props: RenderElementProps) => JSX.Element;
  getHotkeyConfigs: () => IHotKeyConfig[];
  getBlockPanelItems: () => IBlockPanelListItem[];
  getHoveringBarElements: () => IConfigItem[];
}