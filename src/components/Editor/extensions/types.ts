import { Editor } from "slate";
import { RenderElementProps } from "slate-react";
import { HotKeyConfig } from "../hotkeys/types.ts";

export default interface IExtension {
  type: string;
  getPlugins: () => ((editor: Editor) => Editor)[];
  render: (props: RenderElementProps) => JSX.Element;
  getHotkeyConfig: () => HotKeyConfig[];
}