import { Editor } from "slate";

export type Plugin = (editor: Editor) => Editor;

export const applyPlugin = (editor: Editor, plugins: Plugin[]) => {
  return plugins.reduce((acc, plugin) => plugin(acc), editor);
}