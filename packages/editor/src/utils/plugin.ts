import { Editor } from "slate";

/** 原始 Slate 插件：受信任层（ER-005），只给表达不了声明式行为的编辑器级改写用 */
export type Plugin = (editor: Editor) => Editor;

export const applyPlugin = (editor: Editor, plugins: Plugin[]) => {
  return plugins.reduce((acc, plugin) => plugin(acc), editor);
};
