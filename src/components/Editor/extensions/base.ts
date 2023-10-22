import IExtension from "./types.ts";
import { Plugin } from "../utils/plugin.ts";
import { IBlockPanelListItem, IConfigItem, IHotKeyConfig } from "@/components/Editor/types";

export default class Base implements Omit<IExtension, 'render'> {
  type = 'base';
  getPlugins() {
    return [] as Plugin[];
  }
  getHotkeyConfigs() {
    return [] as IHotKeyConfig[];
  }

  getBlockPanelItems() {
    return [] as IBlockPanelListItem[];
  }

  getHoveringBarElements() {
    return [] as IConfigItem[];
  }
}