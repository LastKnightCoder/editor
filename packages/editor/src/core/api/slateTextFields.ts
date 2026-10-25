import type { Editor } from "slate";
import type { EditorTextFields } from "../../../source-contracts";
import { createLocalTextFields } from "../kit/localTextFields";
import { currentElementDefinition } from "./elementVersions";

const fieldsByEditor = new WeakMap<Editor, EditorTextFields>();

/**
 * 供以 Slate 节点属性承载源码的文档绑定（如本地 Yjs 文档）注册 IEditorTextFields：
 * 每个编辑器首次打开字段时建立一份，按该编辑器装配的节点声明校验字段。
 */
export const slateTextFields: EditorTextFields = {
  open(editor: Editor, element, field) {
    let fields = fieldsByEditor.get(editor);
    if (!fields) {
      fields = createLocalTextFields(editor, type => currentElementDefinition(editor, type));
      fieldsByEditor.set(editor, fields);
    }
    return fields.open(editor, element, field);
  },
};
