import type { Descendant, Editor } from "slate";

import type { ServiceRegistration } from "../services/registry";

/**
 * 文档源：回答「内容从哪来、改动往哪去、谁管撤销」（docs/editor-refactor 01 §7.2、ER-009）。
 *
 * 普通值（`createValueDocument`）与 Yjs 绑定（P7 的 `@tau/editor-collab`）是两种实现。
 * 同一篇内容在本机与共享之间切换时 `lineage` 不变，内核据此判断是「换同步方式」还是「换文档」。
 */
export interface EditorDocument {
  /** 内容谱系：同一篇内容在本机 / 共享之间切换时保持不变 */
  readonly lineage: string;
  /** "external" 表示撤销由文档源自己管（Yjs UndoManager），内核不装 withHistory */
  readonly history: "slate" | "external";
  /** 初始内容：挂载首帧使用 */
  readonly initialValue: Descendant[];
  /** 文档源要求的只读（如共享会话被冻结）；与 `<Editor readonly>` 取或 */
  readonly readonly?: boolean;
  /** 本文档源需要覆盖的服务（如共享模式的资源上传） */
  readonly services?: ServiceRegistration;
  /** 挂到编辑器上：开始监听；返回卸载函数 */
  attach?(editor: Editor): () => void;
  /** 编辑器内容变化时回调 */
  onChange?(value: Descendant[], editor: Editor): void;
  /** 文档源自身状态变化（只读、在线状态等）时通知 */
  subscribe?(listener: () => void): () => void;
}

export interface ValueDocumentOptions {
  /** 缺省按内容对象身份生成：同一份值视为同一篇文档 */
  lineage?: string;
  readonly?: boolean;
}

let valueLineageCounter = 0;

/**
 * 普通值文档源：给 blog、预览、只读场景，以及 `<Editor initValue onChange>` 的等价形态。
 * 撤销由内核的 withHistory 负责。
 */
export function createValueDocument(
  initialValue: Descendant[],
  onChange?: (value: Descendant[], editor: Editor) => void,
  options: ValueDocumentOptions = {}
): EditorDocument {
  return {
    lineage: options.lineage ?? `value#${++valueLineageCounter}`,
    history: "slate",
    initialValue,
    readonly: options.readonly,
    onChange,
  };
}
