import type { Editor } from "slate";
import type { ContentResourceDeclarations } from "@tau/db-schema/content-resources";

const EMPTY: ContentResourceDeclarations = Object.freeze({});
const bound = new WeakMap<Editor, ContentResourceDeclarations>();

/** 内核在创建编辑器时绑定当前装配的资源声明 */
export function bindElementResources(editor: Editor, resources: ContentResourceDeclarations) {
  bound.set(editor, resources);
}

/** 当前编辑器已安装的节点资源声明（节点类型 → 资源字段） */
export function getElementResources(editor: Editor): ContentResourceDeclarations {
  return bound.get(editor) ?? EMPTY;
}
