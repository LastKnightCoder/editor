import { Editor } from "slate";

export type HotKeyConfig = {
  hotKey: string;
  action: (editor: Editor) => void;
}

export type Mark = 'bold' | 'italic' | 'underline' | 'highlight' | 'code';