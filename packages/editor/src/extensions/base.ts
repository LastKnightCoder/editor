import IExtension, { IBlockPanelListItem, IConfigItem, IHotKeyConfig } from "./types";
import type { EditorCommand } from "../api/command";
import type { EditorMenuContribution } from "../api/menu";
import { Plugin } from "../utils/plugin";

export default class Base implements Omit<IExtension, "render"> {
  type = "base";
  commands?: EditorCommand[];
  menuItems?: EditorMenuContribution;
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
