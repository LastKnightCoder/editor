import IExtension, {
  IBlockPanelListItem,
  IConfigItem,
  IHotKeyConfig,
} from "./types";
import { Plugin } from "../utils/plugin";

export default class Base implements Omit<IExtension, "render"> {
  type = "base";
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
