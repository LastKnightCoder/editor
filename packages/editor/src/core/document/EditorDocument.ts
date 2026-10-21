import type { ReactElement, ReactNode, RefObject } from "react";
import type { Descendant, Editor } from "slate";
import type { RenderElementProps } from "slate-react";

import type { ServiceRegistration } from "../services/registry";

/**
 * 文档源：回答「内容从哪来、改动往哪去、谁管撤销」（docs/editor-refactor 01 §7.2、ER-009）。
 *
 * 普通值（`createValueDocument`）与 Yjs 绑定（`@tau/editor-collab` 的 `createYjsDocument`）
 * 是两种实现。同一篇内容在本机与共享之间切换时 `lineage` 不变，内核据此判断是
 * 「换同步方式」（同一个 Slate editor 上 `rebind`）还是「换文档」（重建编辑器）。
 */
export interface EditorDocument {
  /** 内容谱系：同一篇内容在本机 / 共享之间切换时保持不变 */
  readonly lineage: string;
  /** "external" 表示撤销由文档源自己管（Yjs UndoManager），内核不装 withHistory */
  readonly history: "slate" | "external";
  /** 初始内容：挂载首帧使用；`bind` 接管内容的文档源可以给空数组 */
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

  /**
   * 受信任层（ER-005，只给内部文档源用，不进公开 API）：接管内容与撤销的文档源在这里
   * 改写 Slate editor。创建编辑器时调用一次；`rebind` 在同谱系换源时调用。
   * @internal
   */
  readonly binding?: EditorDocumentBinding;
}

/** @internal 接管内容来源的文档源（协作）给内核的钩子 */
export interface EditorDocumentBinding {
  /** 创建编辑器时包装一次（装 withYjs 等），内核随后调用 `connect` */
  install(editor: Editor): Editor;
  /** 开始同步：内容从文档源读入 editor.children */
  connect(editor: Editor): void;
  /** 停止同步（先把未发出的本地改动写回文档源） */
  disconnect(editor: Editor): void;
  /**
   * 同谱系换源：把已装好的 editor 从旧文档源迁到本文档源。调用时 editor 已由旧文档源
   * `disconnect`；实现负责改写同步目标、连接，并尽量复用内容相同的节点对象。
   * 返回 false 表示做不到（如不是同一种实现），内核改为重建编辑器。
   */
  rebind?(editor: Editor): boolean;
  /** 让之后的修改另起一个撤销步（输入规则等自动转换用）；history 为 "external" 时应提供 */
  splitUndoStep?(editor: Editor): void;
  /**
   * 元素渲染拦截（如私有块占位）；返回 undefined 走正常分发。
   * `renderByType` 按 kit 分发，该类型没有扩展时返回 undefined。
   */
  renderElement?(
    props: RenderElementProps,
    renderByType: (props: RenderElementProps) => ReactElement | undefined
  ): ReactElement | undefined;
  /**
   * 编辑区之上的覆盖层（如协作光标），容器是编辑区的定位父级。
   * 用函数而不是组件：换源时组件类型一变，React 会重挂载整棵子树。
   */
  renderOverlay?(containerRef: RefObject<HTMLDivElement | null>): ReactNode;
  /** 给子树提供上下文（如 useCollaboration）；返回的外层元素类型必须稳定，理由同上 */
  wrap?(children: ReactNode): ReactNode;
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
