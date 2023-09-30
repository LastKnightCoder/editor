import IExtension from "./types.ts";
import { HotKeyConfig } from "../hotkeys/types.ts";
import { Plugin } from "../utils/plugin.ts";

export default class Base implements Omit<IExtension, 'render'> {
  type = 'base';
  getPlugins() {
    return [] as Plugin[];
  }
  getHotkeyConfigs() {
    return [] as HotKeyConfig[];
  }
}