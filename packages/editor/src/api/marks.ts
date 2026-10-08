import type { ComponentType, ReactNode } from "react";
import type { Editor, NodeEntry, Range, Text } from "slate";

export interface MarkRenderProps {
  readonly leaf: Readonly<Text>;
  children: ReactNode;
}

export interface MarkSpec {
  id: string;
  keys: readonly string[];
  /** 只包装 children；Slate 属性及文本承载由核心持有。 */
  render: ComponentType<MarkRenderProps>;
  /**
   * 非包含标记：光标落到这些标记的边缘时默认停在标记外侧（如行内代码）。
   * 其余标记默认沿用光标左侧的格式；用户可用左右键切换偏向。
   */
  nonInclusiveKeys?: readonly string[];
}

export interface RegisteredMark {
  readonly owner: string;
  readonly spec: MarkSpec;
}

/**
 * 暂态装饰：按节点算出带属性的 Range，属性只出现在渲染用的叶子上，不进文档、不被保存。
 * 配合同一扩展声明的 MarkSpec（keys 取装饰属性名）渲染外观。与宿主的 decorate 合并执行。
 */
export interface DecorationSpec {
  id: string;
  decorate(editor: Editor, entry: NodeEntry): Range[];
  /** 外部数据变化时使装饰重算，订阅随实例及服务作用域清理。 */
  subscribe?(editor: Editor, invalidate: () => void): (() => void) | undefined;
}

export interface RegisteredDecoration {
  readonly owner: string;
  readonly spec: DecorationSpec;
}
