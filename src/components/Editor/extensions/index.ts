import { Editor } from "slate";
import { RenderElementProps, RenderLeafProps } from "slate-react";
import { HotKeyConfig } from "../hotkeys/types.ts";

export class Extension {
  static type: string;
  static applyPlugins: (editor: Editor) => Editor;
  static registerHotkeys: (hotkeysConfig: HotKeyConfig[]) => void;
  static render: (props: RenderElementProps | RenderLeafProps) => JSX.Element;
}
