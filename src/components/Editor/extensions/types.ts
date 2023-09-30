import { RenderElementProps } from "slate-react";
import { HotKeyConfig } from "../hotkeys/types.ts";
import { Plugin } from "../utils/plugin.ts";

export default interface IExtension {
  type: string;
  getPlugins: () => Plugin[];
  render: (props: RenderElementProps) => JSX.Element;
  getHotkeyConfigs: () => HotKeyConfig[];
}